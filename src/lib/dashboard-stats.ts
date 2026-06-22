import { prisma } from "@/lib/db";
import { usesLocalSqlite } from "@/lib/db-mode";
import { DEFAULT_STAKE } from "@/lib/config";
import type { Prisma } from "@prisma/client";
import type { DashboardStats } from "@/lib/stats";

const QUALIFYING_SELECT = {
  id: true,
  raceDate: true,
  course: true,
  horseName: true,
  jockey: true,
  distanceBand: true,
  spDecimal: true,
  won: true,
  placed: true,
  pnl: true,
  finishPos: true,
  year: true,
} as const;

type QualifyingRow = Prisma.HistoricalRaceGetPayload<{
  select: typeof QUALIFYING_SELECT;
}>;

function buildDateFilter(from?: string, to?: string): Prisma.HistoricalRaceWhereInput {
  const filter: Prisma.HistoricalRaceWhereInput = {
    qualified: true,
    // Exclude unsettled live picks from KPIs until results land.
    NOT: {
      AND: [{ raceExternalId: { not: null } }, { finishPos: null }],
    },
  };

  if (from || to) {
    filter.raceDate = {};
    if (from) filter.raceDate.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) filter.raceDate.lte = new Date(`${to}T23:59:59.999Z`);
  }

  return filter;
}

function pnlForRow(row: QualifyingRow, stake: number): number {
  if (row.pnl !== null) return Number(row.pnl);
  const sp = row.spDecimal ? Number(row.spDecimal) : null;
  if (row.won && sp) return stake * (sp - 1);
  return -stake;
}

export interface ComputedDashboard {
  summary: DashboardStats;
  monthly: Array<{ month: string; pnl: number; bets: number; wins: number }>;
  byDistance: Array<{ distance: string; winRate: number; bets: number; pnl: number }>;
  runningPnl: Array<{ date: string; pnl: number }>;
  byYear: Array<{
    year: number;
    winRate: number;
    placedRate: number;
    bets: number;
    pnl: number;
  }>;
  bets: Array<{
    id: number;
    date: string;
    course: string | null;
    horse: string | null;
    jockey: string | null;
    distance: string | null;
    sp: number | null;
    finishPos: number | null;
    won: boolean | null;
    placed: boolean | null;
    pnl: number | null;
    year: number | null;
  }>;
  health: {
    totalRows: number;
    qualifiedRows: number;
    latestRaceDate: string | null;
  };
}

let cachedAllTimeQualified: number | null = null;

export async function loadDashboardFromDatabase(
  from?: string,
  to?: string,
  stake = DEFAULT_STAKE
): Promise<ComputedDashboard> {
  const rows = await prisma.historicalRace.findMany({
    where: buildDateFilter(from, to),
    orderBy: [{ raceDate: "asc" }, { id: "asc" }],
    select: QUALIFYING_SELECT,
  });

  const totalRows = usesLocalSqlite()
    ? await prisma.historicalRace.count()
    : Number(
        (
          await prisma.$queryRaw<Array<{ total: bigint }>>`
            SELECT COALESCE(reltuples::bigint, 0) AS total
            FROM pg_class
            WHERE relname = 'historical_races'
          `
        )[0]?.total ?? 0
      );

  const pendingBets = await prisma.qualifyingBet.count({
    where: { status: { in: ["pending", "alert"] } },
  });

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todayEnd = new Date();
  todayEnd.setUTCHours(23, 59, 59, 999);

  const todayStrongEdges = await prisma.qualifyingBet.count({
    where: {
      raceDate: { gte: todayStart, lte: todayEnd },
      status: { in: ["pending", "alert", "settled"] },
    },
  });

  const pnlValues = rows.map((row) => pnlForRow(row, stake));
  const totalBets = rows.length;
  const wins = rows.filter((row) => row.won).length;
  const placed = rows.filter((row) => row.placed).length;
  const totalPnl = pnlValues.reduce((sum, value) => sum + value, 0);
  const totalStaked = totalBets * stake;

  let peak = 0;
  let maxDrawdown = 0;
  let running = 0;
  for (const pnl of pnlValues) {
    running += pnl;
    if (running > peak) peak = running;
    const drawdown = peak - running;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  const monthly = new Map<string, { pnl: number; bets: number; wins: number }>();
  const distance = new Map<string, { bets: number; wins: number; pnl: number }>();
  const yearly = new Map<number, { bets: number; wins: number; placed: number; pnl: number }>();
  const runningPnl: Array<{ date: string; pnl: number }> = [];

  let cumulative = 0;
  for (const row of rows) {
    const rowPnl = pnlForRow(row, stake);
    cumulative += rowPnl;
    const date = row.raceDate?.toISOString().slice(0, 10) ?? "";
    runningPnl.push({ date, pnl: cumulative });

    if (row.raceDate) {
      const month = `${row.raceDate.getUTCFullYear()}-${String(row.raceDate.getUTCMonth() + 1).padStart(2, "0")}`;
      const monthBucket = monthly.get(month) ?? { pnl: 0, bets: 0, wins: 0 };
      monthBucket.bets += 1;
      monthBucket.wins += row.won ? 1 : 0;
      monthBucket.pnl += row.pnl ? Number(row.pnl) : rowPnl;
      monthly.set(month, monthBucket);
    }

    if (row.distanceBand) {
      const distBucket = distance.get(row.distanceBand) ?? { bets: 0, wins: 0, pnl: 0 };
      distBucket.bets += 1;
      distBucket.wins += row.won ? 1 : 0;
      distBucket.pnl += row.pnl ? Number(row.pnl) : rowPnl;
      distance.set(row.distanceBand, distBucket);
    }

    if (row.year) {
      const yearBucket = yearly.get(row.year) ?? { bets: 0, wins: 0, placed: 0, pnl: 0 };
      yearBucket.bets += 1;
      yearBucket.wins += row.won ? 1 : 0;
      yearBucket.placed += row.placed ? 1 : 0;
      yearBucket.pnl += row.pnl ? Number(row.pnl) : rowPnl;
      yearly.set(row.year, yearBucket);
    }
  }

  const latestRaceDate =
    rows.length > 0
      ? rows[rows.length - 1].raceDate?.toISOString().slice(0, 10) ?? null
      : null;

  const allTimeQualified =
    !from && !to
      ? (cachedAllTimeQualified = totalBets)
      : (cachedAllTimeQualified ?? totalBets);

  return {
    summary: {
      totalBets,
      winRate: totalBets > 0 ? (wins / totalBets) * 100 : 0,
      placedRate: totalBets > 0 ? (placed / totalBets) * 100 : 0,
      roi: totalStaked > 0 ? (totalPnl / totalStaked) * 100 : 0,
      totalPnl,
      maxDrawdown,
      pendingBets,
      todayStrongEdges,
      dateRange: { from: from ?? null, to: to ?? null },
    },
    monthly: Array.from(monthly.entries()).map(([month, data]) => ({ month, ...data })),
    byDistance: Array.from(distance.entries()).map(([dist, data]) => ({
      distance: dist,
      bets: data.bets,
      winRate: data.bets > 0 ? (data.wins / data.bets) * 100 : 0,
      pnl: data.pnl,
    })),
    runningPnl,
    byYear: Array.from(yearly.entries())
      .sort(([a], [b]) => a - b)
      .map(([year, data]) => ({
        year,
        ...data,
        winRate: data.bets > 0 ? (data.wins / data.bets) * 100 : 0,
        placedRate: data.bets > 0 ? (data.placed / data.bets) * 100 : 0,
      })),
    bets: [...rows]
      .reverse()
      .map((row) => ({
        id: row.id,
        date: row.raceDate?.toISOString().slice(0, 10) ?? "",
        course: row.course,
        horse: row.horseName,
        jockey: row.jockey,
        distance: row.distanceBand,
        sp: row.spDecimal ? Number(row.spDecimal) : null,
        finishPos: row.finishPos,
        won: row.won,
        placed: row.placed,
        pnl: row.pnl ? Number(row.pnl) : null,
        year: row.year,
      })),
    health: {
      totalRows,
      qualifiedRows: allTimeQualified,
      latestRaceDate,
    },
  };
}

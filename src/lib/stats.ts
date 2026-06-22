import { prisma } from "@/lib/db";
import { DEFAULT_STAKE } from "@/lib/config";
import type { Prisma } from "@prisma/client";

export interface StatsQuery {
  from?: string;
  to?: string;
  stake?: number;
}

export interface DashboardStats {
  totalBets: number;
  winRate: number;
  placedRate: number;
  roi: number;
  totalPnl: number;
  maxDrawdown: number;
  pendingBets: number;
  todayStrongEdges: number;
  dateRange: { from: string | null; to: string | null };
}

function buildDateFilter(from?: string, to?: string): Prisma.HistoricalRaceWhereInput {
  const filter: Prisma.HistoricalRaceWhereInput = { qualified: true };

  if (from || to) {
    filter.raceDate = {};
    if (from) filter.raceDate.gte = new Date(`${from}T00:00:00.000Z`);
    if (to) filter.raceDate.lte = new Date(`${to}T23:59:59.999Z`);
  }

  return filter;
}

export async function getDashboardStats(query: StatsQuery): Promise<DashboardStats> {
  const stake = query.stake ?? DEFAULT_STAKE;
  const where = buildDateFilter(query.from, query.to);

  const bets = await prisma.historicalRace.findMany({
    where,
    orderBy: [{ raceDate: "asc" }, { id: "asc" }],
    select: {
      won: true,
      placed: true,
      pnl: true,
      spDecimal: true,
    },
  });

  const pendingBets = await prisma.qualifyingBet.count({
    where: { status: "pending" },
  });

  const totalBets = bets.length;
  const wins = bets.filter((bet) => bet.won).length;
  const placed = bets.filter((bet) => bet.placed).length;

  const pnlValues = bets.map((bet) => {
    if (bet.pnl !== null) return Number(bet.pnl);
    const sp = bet.spDecimal ? Number(bet.spDecimal) : null;
    if (bet.won && sp) return stake * (sp - 1);
    return -stake;
  });

  const totalPnl = pnlValues.reduce((sum, value) => sum + value, 0);
  const totalStaked = totalBets * stake;
  const roi = totalStaked > 0 ? (totalPnl / totalStaked) * 100 : 0;

  let peak = 0;
  let maxDrawdown = 0;
  let running = 0;

  for (const pnl of pnlValues) {
    running += pnl;
    if (running > peak) peak = running;
    const drawdown = peak - running;
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  return {
    totalBets,
    winRate: totalBets > 0 ? (wins / totalBets) * 100 : 0,
    placedRate: totalBets > 0 ? (placed / totalBets) * 100 : 0,
    roi,
    totalPnl,
    maxDrawdown,
    pendingBets,
    todayStrongEdges: 0,
    dateRange: {
      from: query.from ?? null,
      to: query.to ?? null,
    },
  };
}

export async function getMonthlyStats(from?: string, to?: string) {
  const where = buildDateFilter(from, to);
  const rows = await prisma.historicalRace.findMany({
    where,
    select: { raceDate: true, pnl: true, won: true },
    orderBy: { raceDate: "asc" },
  });

  const monthly = new Map<string, { pnl: number; bets: number; wins: number }>();

  for (const row of rows) {
    if (!row.raceDate) continue;
    const key = `${row.raceDate.getUTCFullYear()}-${String(row.raceDate.getUTCMonth() + 1).padStart(2, "0")}`;
    const current = monthly.get(key) ?? { pnl: 0, bets: 0, wins: 0 };
    current.bets += 1;
    current.wins += row.won ? 1 : 0;
    current.pnl += row.pnl ? Number(row.pnl) : 0;
    monthly.set(key, current);
  }

  return Array.from(monthly.entries()).map(([month, data]) => ({
    month,
    ...data,
  }));
}

export async function getStatsByDistance(from?: string, to?: string) {
  const where = buildDateFilter(from, to);
  const rows = await prisma.historicalRace.groupBy({
    by: ["distanceBand"],
    where,
    _count: { _all: true },
    _sum: { pnl: true },
  });

  const winCounts = await prisma.historicalRace.groupBy({
    by: ["distanceBand"],
    where: { ...where, won: true },
    _count: { _all: true },
  });

  const winMap = new Map(winCounts.map((row) => [row.distanceBand, row._count._all]));

  return rows
    .filter((row) => row.distanceBand)
    .map((row) => {
      const total = row._count._all;
      const wins = winMap.get(row.distanceBand) ?? 0;
      return {
        distance: row.distanceBand as string,
        bets: total,
        wins,
        winRate: total > 0 ? (wins / total) * 100 : 0,
        pnl: row._sum.pnl ? Number(row._sum.pnl) : 0,
      };
    });
}

export async function getStatsByYear(from?: string, to?: string) {
  const where = buildDateFilter(from, to);
  const rows = await prisma.historicalRace.findMany({
    where,
    select: { year: true, pnl: true, won: true, placed: true },
    orderBy: { year: "asc" },
  });

  const yearly = new Map<number, { bets: number; wins: number; placed: number; pnl: number }>();

  for (const row of rows) {
    if (!row.year) continue;
    const current = yearly.get(row.year) ?? { bets: 0, wins: 0, placed: 0, pnl: 0 };
    current.bets += 1;
    current.wins += row.won ? 1 : 0;
    current.placed += row.placed ? 1 : 0;
    current.pnl += row.pnl ? Number(row.pnl) : 0;
    yearly.set(row.year, current);
  }

  return Array.from(yearly.entries())
    .sort(([a], [b]) => a - b)
    .map(([year, data]) => ({
      year,
      ...data,
      winRate: data.bets > 0 ? (data.wins / data.bets) * 100 : 0,
      placedRate: data.bets > 0 ? (data.placed / data.bets) * 100 : 0,
    }));
}

export async function getQualifyingBets(from?: string, to?: string) {
  const where = buildDateFilter(from, to);
  return prisma.historicalRace.findMany({
    where,
    orderBy: [{ raceDate: "desc" }, { id: "desc" }],
    select: {
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
    },
  });
}

export async function getRunningPnl(from?: string, to?: string) {
  const where = buildDateFilter(from, to);
  const rows = await prisma.historicalRace.findMany({
    where,
    select: { raceDate: true, pnl: true },
    orderBy: [{ raceDate: "asc" }, { id: "asc" }],
  });

  let cumulative = 0;
  return rows.map((row) => {
    cumulative += row.pnl ? Number(row.pnl) : 0;
    return {
      date: row.raceDate?.toISOString().slice(0, 10) ?? "",
      pnl: cumulative,
    };
  });
}

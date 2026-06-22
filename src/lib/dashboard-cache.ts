import { loadDashboardFromDatabase } from "@/lib/dashboard-stats";

export interface DashboardBundle {
  health: {
    ok: true;
    totalRows: number;
    qualifiedRows: number;
    latestRaceDate: string | null;
    dataType: string;
    database: string;
  };
  summary: Awaited<ReturnType<typeof loadDashboardFromDatabase>>["summary"];
  monthly: Awaited<ReturnType<typeof loadDashboardFromDatabase>>["monthly"];
  byDistance: Awaited<ReturnType<typeof loadDashboardFromDatabase>>["byDistance"];
  runningPnl: Awaited<ReturnType<typeof loadDashboardFromDatabase>>["runningPnl"];
  byYear: Awaited<ReturnType<typeof loadDashboardFromDatabase>>["byYear"];
  bets: Awaited<ReturnType<typeof loadDashboardFromDatabase>>["bets"];
}

const CACHE_TTL_MS = 300_000;
const cache = new Map<string, { data: DashboardBundle; expiresAt: number }>();

function cacheKey(from?: string, to?: string): string {
  return `${from ?? "all"}:${to ?? "all"}`;
}

export async function getDashboardBundle(
  from?: string,
  to?: string,
  databaseLabel = "Supabase Postgres"
): Promise<DashboardBundle> {
  const key = cacheKey(from, to);
  const hit = cache.get(key);
  if (hit && Date.now() < hit.expiresAt) {
    return hit.data;
  }

  const computed = await loadDashboardFromDatabase(from, to);

  const data: DashboardBundle = {
    health: {
      ok: true,
      totalRows: computed.health.totalRows,
      qualifiedRows: computed.health.qualifiedRows,
      latestRaceDate: computed.health.latestRaceDate,
      dataType: "historical_backtest",
      database: databaseLabel,
    },
    summary: computed.summary,
    monthly: computed.monthly,
    byDistance: computed.byDistance,
    runningPnl: computed.runningPnl,
    byYear: computed.byYear,
    bets: computed.bets,
  };

  cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
  return data;
}

export function clearDashboardCache(): void {
  cache.clear();
}

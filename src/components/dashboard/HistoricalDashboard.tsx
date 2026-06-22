"use client";

import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Database } from "lucide-react";
import {
  DateRangePicker,
  defaultHistoricalRange,
  toQueryRange,
  type DateRange,
} from "@/components/DateRangePicker";
import { KPICard } from "@/components/KPICard";
import { ChartCard } from "@/components/ChartCard";
import { PnLChart } from "@/components/charts/PnLChart";
import { MonthlyChart } from "@/components/charts/MonthlyChart";
import { DistanceChart } from "@/components/charts/DistanceChart";
import { YearlyChart } from "@/components/charts/YearlyChart";
import { BetsTable, type BetRow } from "@/components/BetsTable";

interface DashboardStats {
  totalBets: number;
  winRate: number;
  placedRate: number;
  roi: number;
  totalPnl: number;
  maxDrawdown: number;
  pendingBets: number;
  todayStrongEdges: number;
}

interface FullStats {
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
  bets: BetRow[];
}

interface HealthStatus {
  qualifiedRows?: number;
  latestRaceDate?: string | null;
  database?: string;
}

function formatCurrency(value: number) {
  const prefix = value >= 0 ? "+£" : "-£";
  return `${prefix}${Math.abs(value).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

export function HistoricalDashboard() {
  const [range, setRange] = useState<DateRange>(defaultHistoricalRange());
  const [data, setData] = useState<FullStats | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchKey, setFetchKey] = useState(0);

  const query = useMemo(() => toQueryRange(range), [range]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStats() {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (query.from) params.set("from", query.from);
      if (query.to) params.set("to", query.to);
      if (fetchKey > 0) params.set("refresh", "1");

      try {
        const response = await fetch(`/api/dashboard?${params.toString()}`, {
          signal: controller.signal,
        });
        const json = await response.json();
        if (!response.ok) {
          throw new Error(
            json.hint ? `${json.error} ${json.hint}` : json.error ?? "Unable to load dashboard"
          );
        }
        setHealth(json.health as HealthStatus);
        setData({
          summary: json.summary,
          monthly: json.monthly,
          byDistance: json.byDistance,
          runningPnl: json.runningPnl,
          byYear: json.byYear,
          bets: json.bets,
        } as FullStats);
      } catch (fetchError) {
        if ((fetchError as Error).name !== "AbortError") {
          setError((fetchError as Error).message);
        }
      } finally {
        setLoading(false);
      }
    }

    loadStats();
    return () => controller.abort();
  }, [query.from, query.to, fetchKey]);

  const stats = data?.summary;
  const rangeLabel =
    query.from && query.to
      ? `${format(new Date(query.from), "dd MMM yyyy")} – ${format(new Date(query.to), "dd MMM yyyy")}`
      : "All time";

  const isFilteredEmpty =
    !loading && !error && stats?.totalBets === 0 && (query.from || query.to);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-betfair-navy">Historical Performance</h2>
        <p className="text-sm text-betfair-muted">
          9-rule UK turf handicap algorithm · Backtest results 2016–2026
        </p>
      </div>

      <DateRangePicker value={range} onChange={setRange} />

      {loading ? (
        <div className="rounded-lg border border-betfair-border bg-white px-4 py-3 text-sm text-betfair-muted">
          Loading historical data{health?.database === "Local SQLite" ? "" : " from Supabase"}…
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm">
          <p className="font-semibold text-betfair-red">Database not ready</p>
          <p className="mt-1 text-betfair-muted">{error}</p>
        </div>
      ) : null}

      {isFilteredEmpty ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Database className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
          <div className="flex-1">
            <p className="font-semibold">No bets in selected date range</p>
            <p className="mt-0.5 text-amber-800/80">
              Backtest data covers 2016–2026 ({health?.qualifiedRows ?? 122} qualifying picks
              total). &quot;This week&quot; only shows live edges from the current calendar week —
              usually empty unless you had strong picks settle recently.
            </p>
            <button
              type="button"
              onClick={() => setRange({ from: undefined, to: undefined })}
              className="mt-3 inline-flex rounded-md bg-betfair-yellow px-3 py-1.5 text-xs font-bold text-betfair-navy hover:bg-betfair-yellow/90"
            >
              Load all time
            </button>
          </div>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title="Total Bets"
          value={stats ? String(stats.totalBets) : "—"}
          subtitle={rangeLabel}
          loading={loading}
          highlight
        />
        <KPICard
          title="Win Rate"
          value={stats ? formatPercent(stats.winRate) : "—"}
          subtitle={rangeLabel}
          trend={stats && stats.winRate >= 50 ? "positive" : "neutral"}
          loading={loading}
        />
        <KPICard
          title="Placed Rate"
          value={stats ? formatPercent(stats.placedRate) : "—"}
          subtitle="Top 3 finishes"
          loading={loading}
        />
        <KPICard
          title="ROI"
          value={stats ? formatPercent(stats.roi) : "—"}
          subtitle="Return on investment"
          trend={stats ? (stats.roi >= 0 ? "positive" : "negative") : "neutral"}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KPICard
          title="Total P&L"
          value={stats ? formatCurrency(stats.totalPnl) : "—"}
          subtitle="£1,000 stake per bet"
          trend={stats ? (stats.totalPnl >= 0 ? "positive" : "negative") : "neutral"}
          loading={loading}
          highlight
        />
        <KPICard
          title="Max Drawdown"
          value={
            stats
              ? `£${stats.maxDrawdown.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`
              : "—"
          }
          subtitle="Worst peak-to-trough"
          trend="negative"
          loading={loading}
        />
        <KPICard
          title="Avg P&L / Bet"
          value={
            stats && stats.totalBets > 0
              ? formatCurrency(stats.totalPnl / stats.totalBets)
              : "—"
          }
          subtitle="Per qualifying selection"
          trend={
            stats && stats.totalBets > 0
              ? stats.totalPnl / stats.totalBets >= 0
                ? "positive"
                : "negative"
              : "neutral"
          }
          loading={loading}
        />
        <KPICard
          title="Backtest Bets"
          value={health?.qualifiedRows ? health.qualifiedRows.toLocaleString() : "—"}
          subtitle={
            health?.latestRaceDate ? `Latest race ${health.latestRaceDate}` : "Qualified picks"
          }
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ChartCard title="Running P&L" description="Cumulative profit and loss over time">
            <PnLChart data={data?.runningPnl ?? []} loading={loading} />
          </ChartCard>
        </div>
        <ChartCard title="Win Rate by Distance" description="6f · 7f · 1m breakdown">
          <DistanceChart data={data?.byDistance ?? []} loading={loading} />
        </ChartCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Monthly P&L" description="Profit/loss by calendar month">
          <MonthlyChart data={data?.monthly ?? []} loading={loading} />
        </ChartCard>
        <ChartCard title="Yearly Performance" description="Win rate vs placed rate by season">
          <YearlyChart data={data?.byYear ?? []} loading={loading} />
        </ChartCard>
      </div>

      <BetsTable bets={data?.bets ?? []} loading={loading} />

      <footer className="border-t border-betfair-border pt-6 text-center text-xs text-betfair-muted">
        Edge Finder · Backtested 2016–2026 · For research purposes only
      </footer>
    </div>
  );
}

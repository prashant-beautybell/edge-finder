"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, BarChart3, CalendarDays, Settings2, Sparkles } from "lucide-react";
import { KPICard } from "@/components/KPICard";
import { ChartCard } from "@/components/ChartCard";
import { PnLChart } from "@/components/charts/PnLChart";
import { SPORT_META, sportBasePath, type SportId } from "@/lib/sports";

interface Summary {
  totalBets: number;
  winRate: number;
  roi: number;
  totalPnl: number;
  todayStrongEdges: number;
  pendingBets: number;
}

interface HealthStatus {
  totalRows?: number;
  qualifiedRows?: number;
}

function formatCurrency(value: number) {
  const prefix = value >= 0 ? "+£" : "-£";
  return `${prefix}${Math.abs(value).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

export function DashboardHome({ sport }: { sport: SportId }) {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [runningPnl, setRunningPnl] = useState<Array<{ date: string; pnl: number }>>([]);
  const meta = SPORT_META[sport];
  const base = sportBasePath(sport);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (sport === "racing") {
          const res = await fetch("/api/dashboard");
          const json = await res.json();
          if (res.ok) {
            setSummary(json.summary);
            setHealth(json.health);
            setRunningPnl((json.runningPnl ?? []).slice(-60));
          }
        } else {
          const res = await fetch(`/api/sport/${sport}/health`);
          const json = await res.json();
          if (res.ok) {
            setHealth(json);
            setSummary({
              totalBets: 0,
              winRate: 0,
              roi: 0,
              totalPnl: 0,
              todayStrongEdges: json.qualifiedRows ?? 0,
              pendingBets: json.qualifiedRows ?? 0,
            });
          }
        }
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [sport]);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-betfair-navy">{meta.label} — Overview</h2>
        <p className="text-sm text-betfair-muted">{meta.tagline}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {sport === "racing" ? (
          <>
            <KPICard
              title="All-time Bets"
              value={summary ? String(summary.totalBets) : "—"}
              subtitle="Historical backtest"
              loading={loading}
              highlight
            />
            <KPICard
              title="Win Rate"
              value={summary ? `${summary.winRate.toFixed(1)}%` : "—"}
              subtitle="All qualifying picks"
              loading={loading}
            />
          </>
        ) : (
          <>
            <KPICard
              title="Fixtures"
              value={health?.totalRows ? String(health.totalRows) : "—"}
              subtitle="In football database"
              loading={loading}
              highlight
            />
            <KPICard
              title="Pending Picks"
              value={health?.qualifiedRows ? String(health.qualifiedRows) : "—"}
              subtitle="Awaiting results"
              loading={loading}
            />
          </>
        )}
        <KPICard
          title="Today's Edges"
          value={summary ? String(summary.todayStrongEdges) : "—"}
          subtitle="Strong picks saved today"
          trend={summary && summary.todayStrongEdges > 0 ? "positive" : "neutral"}
          loading={loading}
        />
        <KPICard
          title="Database"
          value={health?.totalRows ? health.totalRows.toLocaleString() : "—"}
          subtitle={meta.dbLabel}
          loading={loading}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {sport === "racing" ? (
          <div className="lg:col-span-2">
            <ChartCard title="Running P&L" description="Recent cumulative performance (all time)">
              <PnLChart data={runningPnl} loading={loading} />
            </ChartCard>
          </div>
        ) : null}
        <div className={sport === "racing" ? "flex flex-col gap-4" : "lg:col-span-3 grid gap-4 md:grid-cols-3"}>
          <Link
            href={`${base}/today`}
            className="group flex flex-1 flex-col justify-between rounded-lg border border-betfair-border bg-white p-5 shadow-sm transition-colors hover:border-betfair-yellow hover:bg-betfair-yellow/5"
          >
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-betfair-yellow/20">
                <CalendarDays className="h-5 w-5 text-[#9a6700]" />
              </div>
              <h3 className="text-lg font-bold text-betfair-navy">Today</h3>
              <p className="mt-1 text-sm text-betfair-muted">
                Live {meta.eventsLabel.toLowerCase()}, edge picks, and Betfair prices.
              </p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-betfair-navy group-hover:text-[#9a6700]">
              Open today
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>

          {meta.hasHistorical ? (
            <Link
              href={`${base}/historical`}
              className="group flex flex-1 flex-col justify-between rounded-lg border border-betfair-border bg-white p-5 shadow-sm transition-colors hover:border-betfair-yellow hover:bg-betfair-yellow/5"
            >
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-green-50">
                  <BarChart3 className="h-5 w-5 text-betfair-green" />
                </div>
                <h3 className="text-lg font-bold text-betfair-navy">Historical</h3>
                <p className="mt-1 text-sm text-betfair-muted">Backtest charts and qualifying bets.</p>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-betfair-navy group-hover:text-betfair-green">
                View history
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          ) : null}

          <Link
            href={`${base}/rules`}
            className="group flex flex-1 flex-col justify-between rounded-lg border border-betfair-border bg-white p-5 shadow-sm transition-colors hover:border-betfair-yellow hover:bg-betfair-yellow/5"
          >
            <div>
              <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-blue-50">
                <Settings2 className="h-5 w-5 text-blue-700" />
              </div>
              <h3 className="text-lg font-bold text-betfair-navy">Algorithm</h3>
              <p className="mt-1 text-sm text-betfair-muted">Edit strong-edge rules for this sport.</p>
            </div>
            <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-betfair-navy group-hover:text-blue-700">
              Edit rules
              <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </div>
      </div>

      {sport === "racing" && summary && summary.totalPnl !== 0 ? (
        <div className="flex items-center gap-3 rounded-lg border border-betfair-border bg-white px-4 py-3 text-sm">
          <Sparkles className="h-4 w-4 text-betfair-yellow" />
          <span className="text-betfair-muted">
            All-time P&L:{" "}
            <strong className="text-betfair-navy">{formatCurrency(summary.totalPnl)}</strong>
            {" · "}
            ROI: <strong className="text-betfair-navy">{summary.roi.toFixed(1)}%</strong>
          </span>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useRouter, usePathname } from "next/navigation";
import { Activity, BarChart3, RefreshCw, TrendingUp } from "lucide-react";
import { SPORTS, SPORT_META, translateSportPath, type SportId, isSportId } from "@/lib/sports";

interface DashboardHeaderProps {
  sport: SportId;
  onRefresh?: () => void;
  refreshing?: boolean;
  qualifiedRows?: number;
  totalRows?: number;
  databaseLabel?: string;
}

export function DashboardHeader({
  sport,
  onRefresh,
  refreshing = false,
  qualifiedRows,
  totalRows,
  databaseLabel = "Database",
}: DashboardHeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const meta = SPORT_META[sport];

  function handleSportChange(nextSport: string) {
    if (!isSportId(nextSport) || nextSport === sport) return;
    router.push(translateSportPath(sport, nextSport, pathname));
  }

  return (
    <header className="border-b border-betfair-border bg-white shadow-sm">
      <div className="mx-auto flex max-w-[1600px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-md bg-betfair-yellow shadow-sm">
              <TrendingUp className="h-5 w-5 text-betfair-navy" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-betfair-navy">Edge Finder</h1>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-betfair-muted">
                {meta.tagline}
              </p>
            </div>
          </div>

          <div className="hidden h-8 w-px bg-betfair-border md:block" />

          <label className="flex items-center gap-2 text-sm">
            <span className="text-xs font-semibold uppercase tracking-wide text-betfair-muted">
              Sport
            </span>
            <select
              value={sport}
              onChange={(e) => handleSportChange(e.target.value)}
              className="h-8 rounded-md border border-betfair-border bg-white px-2 text-sm font-semibold text-betfair-navy"
            >
              {SPORTS.map((id) => (
                <option key={id} value={id}>
                  {SPORT_META[id].label}
                </option>
              ))}
            </select>
          </label>

          {qualifiedRows !== undefined ? (
            <span className="hidden rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-betfair-green sm:inline">
              {qualifiedRows} qualifying picks
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-3">
          {totalRows !== undefined ? (
            <div className="hidden items-center gap-1.5 text-xs text-betfair-muted sm:flex">
              <BarChart3 className="h-3.5 w-3.5 text-betfair-yellow" />
              <span>{totalRows.toLocaleString()} rows</span>
            </div>
          ) : null}
          <div className="hidden items-center gap-1.5 text-xs text-betfair-muted sm:flex">
            <Activity className="h-3.5 w-3.5 text-betfair-green" />
            <span>{databaseLabel}</span>
          </div>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-betfair-border bg-white px-3 text-xs font-semibold text-betfair-navy transition-colors hover:border-betfair-yellow hover:bg-betfair-yellow/10 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

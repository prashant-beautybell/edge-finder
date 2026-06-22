"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, ScanSearch, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatUkTime } from "@/lib/uk-race-time";
import type { FootballPickDto } from "@/lib/live-football";

interface TodaysFootballPicksProps {
  ready?: boolean;
  refreshKey?: number;
  onSelectFixture?: (fixtureId: string) => void;
}

export function TodaysFootballPicks({
  ready = true,
  refreshKey = 0,
  onSelectFixture,
}: TodaysFootballPicksProps) {
  const [picks, setPicks] = useState<FootballPickDto[]>([]);
  const [qualifying, setQualifying] = useState<FootballPickDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);

  const loadPicks = useCallback(async (scan: boolean) => {
    setError(null);
    if (scan) setScanning(true);
    else setLoading(true);

    try {
      if (scan) {
        const res = await fetch("/api/fixtures/today/picks", { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Scan failed");
        setPicks(json.picks ?? []);
        setQualifying(json.qualifying ?? []);
        setSummary(
          `${json.qualifyingCount ?? 0} strong edge · ${json.scanned ?? 0} fixtures scanned`
        );
      } else {
        const res = await fetch("/api/fixtures/today/picks");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load picks");
        setPicks(json.picks ?? []);
        setQualifying(json.qualifying ?? []);
        setSummary(
          json.picks?.length
            ? `${json.qualifyingCount ?? 0} strong edge · ${json.count ?? 0} fixtures`
            : "Load today's fixtures to scan for edges"
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void loadPicks(refreshKey > 0);
  }, [ready, refreshKey, loadPicks]);

  return (
    <section className="betfair-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-betfair-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-betfair-navy">
            <Sparkles className="h-5 w-5 text-betfair-yellow" />
            Today&apos;s Football Edge Picks
          </h2>
          <p className="text-sm text-betfair-muted">
            Match odds scan — strong home edges saved to the database
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={scanning || !ready}
          onClick={() => loadPicks(true)}
          className="border-betfair-border"
        >
          {scanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ScanSearch className="h-4 w-4" />}
          Scan all markets
        </Button>
      </div>

      {summary ? (
        <div className="border-b border-betfair-border bg-betfair-surface/50 px-5 py-2 text-xs text-betfair-muted">
          {loading ? "Loading picks…" : summary}
        </div>
      ) : null}

      {error ? (
        <div className="border-b border-betfair-border bg-red-50 px-5 py-2 text-sm text-betfair-red">
          {error}
        </div>
      ) : null}

      {qualifying.length > 0 ? (
        <div className="border-b border-green-200 bg-green-50 px-5 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-green-900">
            <Target className="h-4 w-4" />
            {qualifying.length} strong pick{qualifying.length === 1 ? "" : "s"} today
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {qualifying.map((pick) => (
              <button
                key={pick.fixtureId}
                type="button"
                onClick={() => onSelectFixture?.(pick.fixtureId)}
                className="rounded-full border border-green-300 bg-white px-3 py-1 text-xs font-semibold text-green-900 hover:bg-green-100"
              >
                {formatUkTime(pick.kickoffTime)} {pick.homeTeam} v {pick.awayTeam}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-betfair-border bg-betfair-surface text-xs uppercase tracking-wider text-betfair-muted">
              <th className="px-4 py-3 font-semibold">Kickoff</th>
              <th className="px-4 py-3 font-semibold">Competition</th>
              <th className="px-4 py-3 font-semibold">Match</th>
              <th className="px-4 py-3 font-semibold">Pick</th>
              <th className="px-4 py-3 font-semibold">Price</th>
              <th className="px-4 py-3 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            {picks.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-8 text-center text-betfair-muted">
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" /> Loading…
                    </span>
                  ) : (
                    <>
                      Click <strong>Get Today&apos;s Fixtures</strong> — edges scan automatically,
                      or use <strong>Scan all markets</strong>.
                    </>
                  )}
                </td>
              </tr>
            ) : (
              picks.map((pick) => (
                <tr
                  key={pick.fixtureId}
                  className={cn(
                    "border-b border-betfair-border/60 hover:bg-betfair-surface/50",
                    pick.qualifies && "bg-green-50/60"
                  )}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-betfair-navy">
                    {formatUkTime(pick.kickoffTime)}
                  </td>
                  <td className="px-4 py-3 text-betfair-muted">{pick.competition ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-betfair-navy">
                    {pick.homeTeam} v {pick.awayTeam}
                  </td>
                  <td className="px-4 py-3">{pick.selectionName ?? "—"}</td>
                  <td className="px-4 py-3 font-mono">
                    {pick.edgePrice !== null ? pick.edgePrice.toFixed(2) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        pick.qualifies
                          ? "bg-betfair-green text-white"
                          : "bg-betfair-surface text-betfair-muted"
                      )}
                    >
                      {pick.qualifies ? "Strong edge" : pick.failedRuleLabel}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

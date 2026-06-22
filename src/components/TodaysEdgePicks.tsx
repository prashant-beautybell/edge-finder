"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, ScanSearch, Sparkles, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { formatUkTime } from "@/lib/uk-race-time";
import { formatFailedRule, type EdgePickDto } from "@/lib/live/edge-picks-types";

interface TodaysEdgePicksProps {
  ready?: boolean;
  refreshKey?: number;
  onSelectRace?: (raceId: string) => void;
  onResultsSettled?: () => void;
}

function formatSp(sp: number | null) {
  if (sp === null) return "—";
  return sp.toFixed(2);
}

export function TodaysEdgePicks({
  ready = true,
  refreshKey = 0,
  onSelectRace,
  onResultsSettled,
}: TodaysEdgePicksProps) {
  const [picks, setPicks] = useState<EdgePickDto[]>([]);
  const [qualifying, setQualifying] = useState<EdgePickDto[]>([]);
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
        const res = await fetch("/api/races/today/picks", { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Scan failed");
        setPicks(json.picks ?? []);
        setQualifying(json.qualifying ?? []);
        setSummary(
          `${json.qualifyingCount ?? 0} strong edge · ${json.structural ?? 0} structural of ${json.scanned ?? 0} races`
        );
      } else {
        const res = await fetch("/api/races/today/picks");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Failed to load picks");
        setPicks(json.picks ?? []);
        setQualifying(json.qualifying ?? []);
        setSummary(
          json.picks?.length
            ? `${json.qualifyingCount ?? 0} strong edge · ${json.count ?? 0} structural candidates`
            : "Load today's schedule to scan for edges"
        );
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
      setScanning(false);
    }
  }, []);

  const onResultsSettledRef = useRef(onResultsSettled);
  onResultsSettledRef.current = onResultsSettled;

  const syncPendingResults = useCallback(async () => {
    try {
      const res = await fetch("/api/races/today/results", { method: "POST" });
      const json = await res.json();
      if (res.ok && (json.settled ?? 0) > 0) {
        onResultsSettledRef.current?.();
        await loadPicks(false);
      }
    } catch {
      // Results may not be published yet.
    }
  }, [loadPicks]);

  // Load picks on mount and when parent signals a new schedule scan.
  useEffect(() => {
    if (!ready) return;
    void loadPicks(refreshKey > 0);
  }, [ready, refreshKey, loadPicks]);

  // Check for results every 5 min when there are qualifying picks (not on every render).
  useEffect(() => {
    if (!ready || qualifying.length === 0) return;
    const id = window.setInterval(() => void syncPendingResults(), 5 * 60 * 1000);
    return () => window.clearInterval(id);
  }, [ready, qualifying.length, syncPendingResults]);

  return (
    <section className="betfair-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-betfair-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-betfair-navy">
            <Sparkles className="h-5 w-5 text-betfair-yellow" />
            Today&apos;s Edge Picks
          </h2>
          <p className="text-sm text-betfair-muted">
            Strong edges are saved to the database and update charts when results land
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={scanning || !ready}
          onClick={() => loadPicks(true)}
          className="border-betfair-border"
        >
          {scanning ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <ScanSearch className="h-4 w-4" />
          )}
          Scan all cards
        </Button>
      </div>

      {summary ? (
        <div className="border-b border-betfair-border bg-betfair-surface/50 px-5 py-2 text-xs text-betfair-muted">
          {loading ? "Loading edge picks…" : summary}
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
            {qualifying.length} strong edge pick{qualifying.length === 1 ? "" : "s"} today
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {qualifying.map((pick) => (
              <button
                key={pick.raceId}
                type="button"
                onClick={() => onSelectRace?.(pick.raceId)}
                className="rounded-full border border-green-300 bg-white px-3 py-1 text-xs font-semibold text-green-900 hover:bg-green-100"
              >
                {formatUkTime(pick.raceTime)} {pick.course} — {pick.horseName}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-betfair-border bg-betfair-surface text-xs uppercase tracking-wider text-betfair-muted">
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 font-semibold">Course</th>
              <th className="px-4 py-3 font-semibold">Predicted pick</th>
              <th className="px-4 py-3 font-semibold">Jockey</th>
              <th className="px-4 py-3 font-semibold">SP</th>
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
                      Click <strong>Get Today&apos;s Schedule</strong> — edges scan automatically,
                      or use <strong>Scan all cards</strong>.
                    </>
                  )}
                </td>
              </tr>
            ) : (
              picks.map((pick) => (
                <tr
                  key={pick.raceId}
                  onClick={() => onSelectRace?.(pick.raceId)}
                  className={cn(
                    "cursor-pointer border-b border-betfair-border/60 hover:bg-betfair-surface/60",
                    pick.qualifies && "bg-green-50/80 ring-1 ring-inset ring-green-300/60"
                  )}
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono">
                    {formatUkTime(pick.raceTime)}
                  </td>
                  <td className="px-4 py-3 font-medium">{pick.course}</td>
                  <td className="px-4 py-3">
                    {pick.horseName ? (
                      <span className="inline-flex items-center gap-1.5 font-semibold text-betfair-navy">
                        {pick.qualifies ? (
                          <span className="rounded bg-betfair-green px-1.5 py-0.5 text-[10px] font-bold text-white">
                            PICK
                          </span>
                        ) : null}
                        {pick.horseName}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-betfair-muted">{pick.jockey ?? "—"}</td>
                  <td className="px-4 py-3 font-mono">{formatSp(pick.morningSp)}</td>
                  <td className="px-4 py-3">
                    {pick.qualifies ? (
                      <span className="rounded bg-betfair-green/15 px-2 py-0.5 text-xs font-semibold text-betfair-green">
                        Strong edge
                      </span>
                    ) : pick.evaluated ? (
                      <span className="text-xs text-betfair-muted">{pick.failedRuleLabel}</span>
                    ) : (
                      <span className="text-xs text-betfair-muted">Awaiting card</span>
                    )}
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

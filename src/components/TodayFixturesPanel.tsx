"use client";

import { useCallback, useEffect, useRef, useState, Fragment } from "react";
import { format } from "date-fns";
import {
  ChevronDown,
  ChevronRight,
  Clock,
  Download,
  ExternalLink,
  Loader2,
  Radio,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { LiveFootballFixtureDto } from "@/lib/live-football";

interface BetfairStatus {
  configured: boolean;
  connected: boolean;
  message: string;
}

function formatTime(iso: string) {
  return format(new Date(iso), "HH:mm");
}

function formatGbp(value: number | null) {
  if (value === null) return "—";
  if (value >= 1_000_000) return `£${(value / 1_000_000).toFixed(2)}m`;
  if (value >= 1_000) return `£${(value / 1_000).toFixed(1)}k`;
  return `£${value.toFixed(0)}`;
}

function findNearestLiveFixture(fixtures: LiveFootballFixtureDto[]) {
  const now = Date.now();
  let best: LiveFootballFixtureDto | null = null;
  let bestDiff = Infinity;
  for (const f of fixtures) {
    const diff = Math.abs(new Date(f.kickoffTime).getTime() - now);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = f;
    }
  }
  return best;
}

export function TodayFixturesPanel({
  ready = true,
  focusFixtureId = null,
  onScheduleLoaded,
}: {
  ready?: boolean;
  focusFixtureId?: string | null;
  onScheduleLoaded?: () => void;
}) {
  const [fixtures, setFixtures] = useState<LiveFootballFixtureDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingToday, setFetchingToday] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [betfairStatus, setBetfairStatus] = useState<BetfairStatus | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, string>>({});
  const [liveFixtureId, setLiveFixtureId] = useState<string | null>(null);
  const [livePolling, setLivePolling] = useState(false);

  const fixturesRef = useRef(fixtures);
  fixturesRef.current = fixtures;
  const bootstrappedRef = useRef<string | null>(null);
  const exchangeInFlightRef = useRef(false);
  const liveRowRef = useRef<HTMLTableRowElement | null>(null);

  const loadFixtures = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/fixtures/today");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load fixtures");
      setFixtures(json.fixtures ?? []);
      onScheduleLoaded?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [onScheduleLoaded]);

  const loadBetfairStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/betfair/football/status");
      setBetfairStatus(await res.json());
    } catch {
      setBetfairStatus({ configured: false, connected: false, message: "Betfair status unavailable" });
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    void loadFixtures();
  }, [ready, loadFixtures]);

  useEffect(() => {
    void loadBetfairStatus();
  }, [loadBetfairStatus]);

  const updateFixture = useCallback((updated: LiveFootballFixtureDto) => {
    setFixtures((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
  }, []);

  const fetchAction = useCallback(
    async (fixtureId: string, action: "refresh" | "exchange", silent = false) => {
      if (!silent) setActionLoading((p) => ({ ...p, [fixtureId]: action }));
      if (!silent) setError(null);
      const endpoint =
        action === "refresh"
          ? `/api/fixtures/${fixtureId}/refresh`
          : `/api/fixtures/${fixtureId}/exchange`;
      try {
        const res = await fetch(endpoint, { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Failed to ${action}`);
        updateFixture(json.fixture as LiveFootballFixtureDto);
        setExpanded((p) => ({ ...p, [fixtureId]: true }));
        if (action === "exchange") void loadBetfairStatus();
        return json.fixture as LiveFootballFixtureDto;
      } catch (err) {
        if (!silent) setError((err as Error).message);
        throw err;
      } finally {
        if (!silent) {
          setActionLoading((p) => {
            const next = { ...p };
            delete next[fixtureId];
            return next;
          });
        }
      }
    },
    [loadBetfairStatus, updateFixture]
  );

  useEffect(() => {
    if (!fixtures.length) return;
    const pick = () => {
      const nearest = findNearestLiveFixture(fixturesRef.current);
      if (!nearest) return;
      setLiveFixtureId(nearest.id);
      setExpanded((p) => ({ ...p, [nearest.id]: true }));
    };
    pick();
    const id = window.setInterval(pick, 60_000);
    return () => window.clearInterval(id);
  }, [fixtures.length]);

  useEffect(() => {
    if (!focusFixtureId) return;
    setLiveFixtureId(focusFixtureId);
    setExpanded((p) => ({ ...p, [focusFixtureId]: true }));
    const fixture = fixturesRef.current.find((f) => f.id === focusFixtureId);
    if (fixture && fixture.selections.length === 0) {
      void fetchAction(focusFixtureId, "refresh", true);
    }
  }, [focusFixtureId, fetchAction]);

  useEffect(() => {
    const scrollId = focusFixtureId ?? liveFixtureId;
    if (!scrollId) return;
    liveRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [liveFixtureId, focusFixtureId]);

  const liveSelectionCount =
    fixtures.find((f) => f.id === liveFixtureId)?.selections.length ?? 0;

  useEffect(() => {
    if (!liveFixtureId || !betfairStatus?.configured) return;
    if (bootstrappedRef.current === liveFixtureId) return;
    bootstrappedRef.current = liveFixtureId;

    (async () => {
      try {
        if (liveSelectionCount === 0) {
          await fetchAction(liveFixtureId, "refresh", true);
        }
        if (!exchangeInFlightRef.current) {
          await fetchAction(liveFixtureId, "exchange", true);
        }
      } catch {
        // Market may not be open yet.
      }
    })();
  }, [liveFixtureId, betfairStatus?.configured, liveSelectionCount, fetchAction]);

  useEffect(() => {
    if (!liveFixtureId || !betfairStatus?.connected) return;
    setLivePolling(true);
    const poll = async () => {
      if (exchangeInFlightRef.current) return;
      exchangeInFlightRef.current = true;
      try {
        await fetchAction(liveFixtureId, "exchange", true);
      } catch {
        // ignore poll errors
      } finally {
        exchangeInFlightRef.current = false;
      }
    };
    void poll();
    const id = window.setInterval(poll, 1000);
    return () => {
      window.clearInterval(id);
      setLivePolling(false);
    };
  }, [liveFixtureId, betfairStatus?.connected, fetchAction]);

  async function handleImportMarket() {
    if (!importUrl.trim()) return;
    setImporting(true);
    setError(null);
    try {
      const res = await fetch("/api/fixtures/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: importUrl.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to import market");
      const imported = json.fixture as LiveFootballFixtureDto;
      setFixtures((prev) => {
        const rest = prev.filter((f) => f.id !== imported.id);
        return [...rest, imported].sort(
          (a, b) => new Date(a.kickoffTime).getTime() - new Date(b.kickoffTime).getTime()
        );
      });
      setImportUrl("");
      setExpanded((p) => ({ ...p, [imported.id]: true }));
      onScheduleLoaded?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setImporting(false);
    }
  }

  async function handleFetchToday() {
    setFetchingToday(true);
    setError(null);
    try {
      const res = await fetch("/api/fixtures/today", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch today's fixtures");
      setFixtures(json.fixtures ?? []);
      onScheduleLoaded?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFetchingToday(false);
    }
  }

  function toggleExpanded(fixtureId: string) {
    const willOpen = !expanded[fixtureId];
    setExpanded((p) => ({ ...p, [fixtureId]: willOpen }));
    if (willOpen) {
      const fixture = fixtures.find((f) => f.id === fixtureId);
      if (fixture && fixture.selections.length === 0) {
        void fetchAction(fixtureId, "refresh");
      }
    }
  }

  const todayLabel = format(new Date(), "EEEE d MMMM yyyy");

  return (
    <section className="space-y-4">
      <div className="betfair-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-betfair-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-bold text-betfair-navy">Today&apos;s Football</h2>
            <p className="text-sm text-betfair-muted">
              {todayLabel} · UK time · Auto-syncs from Betfair on load · Live refresh 1s
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 gap-2">
              <input
                type="text"
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                placeholder="Paste Betfair match URL or market id…"
                className="min-w-0 flex-1 rounded-md border border-betfair-border bg-white px-3 py-2 text-sm text-betfair-navy placeholder:text-betfair-muted"
              />
              <Button
                onClick={handleImportMarket}
                disabled={importing || !ready || !importUrl.trim()}
                variant="outline"
                className="shrink-0 border-betfair-border font-semibold"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
              </Button>
            </div>
            <Button
              onClick={handleFetchToday}
              disabled={fetchingToday || !ready}
              className="bg-betfair-yellow font-bold text-betfair-navy hover:bg-betfair-yellow/90"
            >
              {fetchingToday ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Get Today&apos;s Fixtures
            </Button>
          </div>
        </div>

        {betfairStatus ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-betfair-border bg-betfair-surface/40 px-5 py-2 text-xs">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-semibold",
                betfairStatus.connected
                  ? "bg-green-100 text-green-800"
                  : "bg-amber-100 text-amber-800"
              )}
            >
              Betfair Exchange: {betfairStatus.message}
            </span>
            {liveFixtureId && livePolling ? (
              <span className="rounded-full bg-betfair-yellow/30 px-2 py-0.5 font-semibold text-[#9a6700]">
                <Radio className="mr-1 inline h-3 w-3" />
                Live {formatTime(fixtures.find((f) => f.id === liveFixtureId)?.kickoffTime ?? "")} ·
                1s refresh
              </span>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <div className="border-b border-betfair-border bg-red-50 px-5 py-2 text-sm text-betfair-red">
            {error}
          </div>
        ) : null}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-betfair-border bg-betfair-surface text-xs uppercase tracking-wider text-betfair-muted">
                <th className="w-8 px-3 py-3" />
                <th className="px-3 py-3 font-semibold">Kickoff</th>
                <th className="px-3 py-3 font-semibold">Competition</th>
                <th className="px-3 py-3 font-semibold">Match</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-betfair-muted">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Syncing today&apos;s fixtures from Betfair…
                  </td>
                </tr>
              ) : fixtures.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-betfair-muted">
                    No Match Odds markets found for today on Betfair — try <strong>Import</strong> with a
                    match URL, or check your system date matches Betfair&apos;s &quot;today&quot;
                  </td>
                </tr>
              ) : (
                fixtures.map((fixture) => {
                  const isOpen = expanded[fixture.id];
                  const isLive = fixture.id === liveFixtureId;
                  const isEdge = fixture.qualifying;
                  const busy = actionLoading[fixture.id];
                  return (
                    <Fragment key={fixture.id}>
                      <tr
                        ref={isLive || fixture.id === focusFixtureId ? liveRowRef : undefined}
                        className={cn(
                          "border-b border-betfair-border/60 hover:bg-betfair-surface/60",
                          isEdge && "bg-green-50/70",
                          isLive && "bg-betfair-yellow/10 ring-1 ring-inset ring-betfair-yellow/50"
                        )}
                      >
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(fixture.id)}
                            className="text-betfair-muted hover:text-betfair-navy"
                          >
                            {isOpen ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono">
                          <span className="inline-flex items-center gap-1 text-betfair-navy">
                            <Clock className="h-3 w-3 text-betfair-muted" />
                            {formatTime(fixture.kickoffTime)}
                            {isLive ? (
                              <span className="rounded bg-betfair-yellow px-1 text-[10px] font-bold text-betfair-navy">
                                LIVE
                              </span>
                            ) : null}
                            {isEdge ? (
                              <span className="inline-flex items-center gap-0.5 rounded bg-betfair-green px-1 text-[10px] font-bold text-white">
                                <Sparkles className="h-2.5 w-2.5" />
                                EDGE
                              </span>
                            ) : null}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-betfair-muted">
                          {fixture.competition ?? fixture.country ?? "—"}
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium text-betfair-navy">
                            {fixture.homeTeam} v {fixture.awayTeam}
                          </p>
                          {fixture.betfairMarketUrl ? (
                            <a
                              href={fixture.betfairMarketUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs text-blue-700 hover:underline"
                            >
                              Betfair · Matched {formatGbp(fixture.marketTotalMatched)}
                            </a>
                          ) : null}
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                            {fixture.hasExchangeOdds ? "Live odds" : fixture.status}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fetchAction(fixture.id, "refresh")}
                              disabled={Boolean(busy)}
                              className="h-7 border-betfair-border text-xs"
                            >
                              {busy === "refresh" ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <RefreshCw className="h-3 w-3" />
                              )}
                              Market
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => fetchAction(fixture.id, "exchange")}
                              disabled={Boolean(busy)}
                              className="h-7 border-betfair-border text-xs"
                            >
                              {busy === "exchange" ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Radio className="h-3 w-3" />
                              )}
                              Exchange
                            </Button>
                            {fixture.betfairMarketUrl ? (
                              <a
                                href={fixture.betfairMarketUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex h-7 items-center gap-1 rounded-md border border-betfair-border px-2 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                              >
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-betfair-surface/40">
                          <td colSpan={6} className="px-5 py-4">
                            {fixture.selections.length > 0 ? (
                              <table className="w-full text-left text-xs">
                                <thead>
                                  <tr className="border-b border-betfair-border text-betfair-muted">
                                    <th className="px-2 py-2 font-semibold">Selection</th>
                                    <th className="px-2 py-2 text-center font-semibold">Back</th>
                                    <th className="px-2 py-2 text-center font-semibold">Lay</th>
                                    <th className="px-2 py-2 font-semibold">Matched</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {fixture.selections.map((sel) => (
                                    <tr
                                      key={sel.id}
                                      className={cn(
                                        "border-b border-betfair-border/50",
                                        sel.qualifies && "bg-green-50/80"
                                      )}
                                    >
                                      <td className="px-2 py-2 font-medium text-betfair-navy">
                                        {sel.name}
                                        {sel.qualifies ? (
                                          <span className="ml-2 rounded bg-betfair-green px-1 text-[10px] font-bold text-white">
                                            PICK
                                          </span>
                                        ) : null}
                                      </td>
                                      <td className="px-2 py-2 text-center font-mono">
                                        {sel.exchangePrice?.toFixed(2) ?? "—"}
                                      </td>
                                      <td className="px-2 py-2 text-center font-mono">
                                        {sel.exchangeLayPrice?.toFixed(2) ?? "—"}
                                      </td>
                                      <td className="px-2 py-2 font-mono text-betfair-muted">
                                        {formatGbp(sel.matchedVolume)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ) : (
                              <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-betfair-muted">
                                {busy === "refresh" ? (
                                  <>
                                    <Loader2 className="h-5 w-5 animate-spin text-betfair-yellow" />
                                    Loading match odds…
                                  </>
                                ) : (
                                  <>
                                    <p>Match odds not loaded — click <strong>Market</strong>.</p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => fetchAction(fixture.id, "refresh")}
                                      className="border-betfair-border"
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                      Load Market
                                    </Button>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

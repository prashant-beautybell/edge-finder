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
  TrendingUp,
  Trophy,
  Sparkles,
  X,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { findNearestLiveRace, formatUkTime } from "@/lib/uk-race-time";
import {
  findPriceHits,
  type PriceAlert,
  type PriceHit,
  type AlertSide,
  type AlertComparator,
  COMPARATOR_OPTIONS,
  formatComparator,
} from "@/lib/price-alerts";

export interface LiveRunnerDto {
  id: number;
  horseName: string;
  jockey: string | null;
  trainer: string | null;
  officialRating: number | null;
  weightTotalLbs: number | null;
  morningPrice: number | null;
  latestPrice: number | null;
  exchangePrice: number | null;
  exchangeLayPrice: number | null;
  backSize: number | null;
  laySize: number | null;
  matchedVolume: number | null;
  isFavourite: boolean | null;
  finishPosition: number | null;
  spDecimal: number | null;
  isWinner: boolean | null;
  isPlaced: boolean | null;
  qualifies: boolean;
  disqualifyReason: string | null;
}

export interface LiveRaceDto {
  id: string;
  course: string;
  raceTime: string;
  raceName: string | null;
  raceType: string | null;
  distanceBand: string | null;
  going: string | null;
  fieldSize: number | null;
  isHandicap: boolean;
  isTurf: boolean;
  status: string;
  qualifying: boolean;
  edgePickHorse: string | null;
  runnerCount: number;
  hasOdds: boolean;
  hasExchangeOdds: boolean;
  hasResults: boolean;
  raceUrl: string | null;
  betfairMarketId: string | null;
  betfairMarketUrl: string | null;
  marketTotalMatched: number | null;
  oddsFetchedAt: string | null;
  runners: LiveRunnerDto[];
}

interface BetfairMarketRunner {
  horseName: string;
  backPrice: number | null;
  backSize: number | null;
  layPrice: number | null;
  laySize: number | null;
  matchedVolume: number | null;
}

interface BetfairMarketView {
  marketId: string;
  marketName: string;
  venue: string | null;
  marketStartTime: string | null;
  marketTotalMatched: number | null;
  marketUrl: string;
  runners: BetfairMarketRunner[];
}

type RaceAction = "card" | "exchange" | "results";

interface BetfairStatus {
  configured: boolean;
  connected: boolean;
  message: string;
}

function formatTime(iso: string) {
  return formatUkTime(iso);
}

function formatOdds(value: number | null) {
  if (value === null) return "—";
  if (value <= 1) return value.toFixed(2);
  return value.toFixed(2);
}

function formatGbp(value: number | null) {
  if (value === null) return "—";
  return `£${value.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

function statusLabel(status: string, hasExchange: boolean) {
  if (hasExchange) return "Live odds";
  switch (status) {
    case "card_loaded":
      return "Card loaded";
    case "resulted":
      return "Resulted";
    default:
      return "Scheduled";
  }
}

function statusClass(status: string, hasExchange: boolean) {
  if (hasExchange) return "bg-betfair-yellow/20 text-[#9a6700]";
  switch (status) {
    case "card_loaded":
      return "bg-blue-50 text-blue-700";
    case "resulted":
      return "bg-green-50 text-betfair-green";
    default:
      return "bg-gray-100 text-betfair-muted";
  }
}

function PriceCell({
  price,
  size,
  type,
}: {
  price: number | null;
  size: number | null;
  type: "back" | "lay";
}) {
  if (price === null) {
    return <td className="px-1 py-1.5 text-center text-betfair-muted">—</td>;
  }

  return (
    <td className="px-1 py-1.5">
      <div
        className={cn(
          "mx-auto flex min-w-[72px] max-w-[88px] flex-col items-center justify-center rounded px-2 py-1 text-center",
          type === "back"
            ? "bg-[#a6d8ff] text-[#1a3d5c]"
            : "bg-[#fac9d4] text-[#5c1a2e]"
        )}
      >
        <span className="text-sm font-bold leading-tight">{formatOdds(price)}</span>
        {size !== null ? (
          <span className="text-[10px] leading-tight opacity-90">{formatGbp(size)}</span>
        ) : null}
      </div>
    </td>
  );
}

export function TodayRacesPanel({
  ready = true,
  focusRaceId = null,
  onScheduleLoaded,
}: {
  ready?: boolean;
  focusRaceId?: string | null;
  /** Fired once after Get Today's Schedule (not on every race list refresh). */
  onScheduleLoaded?: () => void;
}) {
  const [races, setRaces] = useState<LiveRaceDto[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetchingToday, setFetchingToday] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [betfairStatus, setBetfairStatus] = useState<BetfairStatus | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [actionLoading, setActionLoading] = useState<Record<string, RaceAction>>({});
  const [liveRaceId, setLiveRaceId] = useState<string | null>(null);
  const [livePolling, setLivePolling] = useState(false);
  const [priceAlerts, setPriceAlerts] = useState<PriceAlert[]>([]);
  const [priceHits, setPriceHits] = useState<PriceHit[]>([]);
  const [directMarketUrl, setDirectMarketUrl] = useState("");
  const [directMarket, setDirectMarket] = useState<BetfairMarketView | null>(null);
  const [directMarketLoading, setDirectMarketLoading] = useState(false);
  const [showAdvancedLookup, setShowAdvancedLookup] = useState(false);

  const exchangeInFlightRef = useRef(false);
  const bootstrappedRaceRef = useRef<string | null>(null);
  const liveRowRef = useRef<HTMLTableRowElement | null>(null);
  const triggeredAlertIdsRef = useRef<Set<string>>(new Set());
  const racesRef = useRef(races);
  racesRef.current = races;

  const dismissPriceHit = useCallback((alertId: string) => {
    setPriceHits((prev) => prev.filter((h) => h.alert.id !== alertId));
  }, []);

  const removePriceAlert = useCallback((alertId: string) => {
    setPriceAlerts((prev) => prev.filter((a) => a.id !== alertId));
    triggeredAlertIdsRef.current.delete(alertId);
  }, []);

  const checkPriceAlerts = useCallback(
    (race: LiveRaceDto) => {
      if (race.id !== liveRaceId || priceAlerts.length === 0) return;

      const pending = priceAlerts.filter((a) => !triggeredAlertIdsRef.current.has(a.id));
      if (pending.length === 0) return;

      const hits = findPriceHits(pending, race.runners, {
        course: race.course,
        raceTime: race.raceTime,
      });

      if (hits.length === 0) return;

      for (const hit of hits) {
        triggeredAlertIdsRef.current.add(hit.alert.id);
      }

      setPriceHits((prev) => {
        const existing = new Set(prev.map((h) => h.alert.id));
        const fresh = hits.filter((h) => !existing.has(h.alert.id));
        return [...prev, ...fresh];
      });

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        for (const hit of hits) {
          const side = hit.alert.side === "back" ? "Back" : "Lay";
          new Notification("Price hit!", {
            body: `${hit.alert.horseName} — ${side} ${formatComparator(hit.alert.comparator)} ${hit.alert.targetPrice.toFixed(2)} (now ${hit.currentPrice.toFixed(2)})`,
          });
        }
      }
    },
    [liveRaceId, priceAlerts]
  );

  const checkPriceAlertsRef = useRef(checkPriceAlerts);
  checkPriceAlertsRef.current = checkPriceAlerts;

  const todayLabel = format(new Date(), "EEEE d MMMM yyyy");

  const loadRaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/races/today");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to load today's races");
      setRaces(json.races ?? []);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadBetfairStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/betfair/status");
      const text = await res.text();
      try {
        setBetfairStatus(JSON.parse(text));
      } catch {
        setBetfairStatus({
          configured: false,
          connected: false,
          message: "Betfair status API unavailable — redeploy after setting database env vars.",
        });
      }
    } catch {
      setBetfairStatus(null);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadRaces();
  }, [ready, loadRaces]);

  useEffect(() => {
    loadBetfairStatus();
  }, [loadBetfairStatus]);

  const updateRaceInList = useCallback((updatedRace: LiveRaceDto) => {
    setRaces((prev) => prev.map((r) => (r.id === updatedRace.id ? updatedRace : r)));
  }, []);

  const fetchRaceAction = useCallback(
    async (raceId: string, action: RaceAction, options?: { silent?: boolean }) => {
      const silent = options?.silent ?? false;
      if (!silent) {
        setActionLoading((prev) => ({ ...prev, [raceId]: action }));
      }
      if (!silent) setError(null);

      const endpoints: Record<RaceAction, string> = {
        card: `/api/races/${raceId}/refresh`,
        exchange: `/api/races/${raceId}/exchange`,
        results: `/api/races/${raceId}/results`,
      };

      const labels: Record<RaceAction, string> = {
        card: "Failed to load racecard",
        exchange: "Failed to fetch Betfair Exchange prices",
        results: "Failed to fetch results",
      };

      try {
        const res = await fetch(endpoints[action], { method: "POST" });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? labels[action]);

        const updatedRace = json.race as LiveRaceDto;
        updateRaceInList(updatedRace);
        setExpanded((prev) => ({ ...prev, [raceId]: true }));

        if (action === "exchange" || action === "card") {
          loadBetfairStatus();
        }

        if (action === "exchange") {
          checkPriceAlertsRef.current(updatedRace);
        }

        return updatedRace;
      } catch (err) {
        if (!silent) {
          setError((err as Error).message);
        }
        throw err;
      } finally {
        if (!silent) {
          setActionLoading((prev) => {
            const next = { ...prev };
            delete next[raceId];
            return next;
          });
        }
      }
    },
    [loadBetfairStatus, updateRaceInList]
  );

  // Pick the race nearest to UK now whenever the schedule loads or time passes.
  useEffect(() => {
    if (!races.length) return;

    const pick = () => {
      const nearest = findNearestLiveRace(racesRef.current);
      if (!nearest) return;
      setLiveRaceId(nearest.id);
      setExpanded((prev) => ({ ...prev, [nearest.id]: true }));
    };

    pick();
    const id = window.setInterval(pick, 60_000);
    return () => window.clearInterval(id);
  }, [races.length]);

  useEffect(() => {
    if (!focusRaceId) return;
    setLiveRaceId(focusRaceId);
    setExpanded((prev) => ({ ...prev, [focusRaceId]: true }));
    const race = racesRef.current.find((r) => r.id === focusRaceId);
    if (race && race.runners.length === 0 && race.raceUrl) {
      void fetchRaceAction(focusRaceId, "card", { silent: true });
    }
  }, [focusRaceId, fetchRaceAction]);

  // Scroll the live race row into view when it changes.
  useEffect(() => {
    const scrollId = focusRaceId ?? liveRaceId;
    if (!scrollId) return;
    liveRowRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [liveRaceId, focusRaceId]);

  // Reset bootstrap when the tracked race changes.
  useEffect(() => {
    bootstrappedRaceRef.current = null;
    setPriceAlerts([]);
    setPriceHits([]);
    triggeredAlertIdsRef.current.clear();
  }, [liveRaceId]);

  const liveRunnerCount = races.find((r) => r.id === liveRaceId)?.runners.length ?? 0;

  // Open card (if needed) then start exchange prices for the live race.
  useEffect(() => {
    if (!liveRaceId || !betfairStatus?.configured) return;
    if (bootstrappedRaceRef.current === liveRaceId) return;

    let cancelled = false;
    bootstrappedRaceRef.current = liveRaceId;

    (async () => {
      try {
        if (liveRunnerCount === 0) {
          await fetchRaceAction(liveRaceId, "card", { silent: true });
        }
        if (!cancelled) {
          await fetchRaceAction(liveRaceId, "exchange", { silent: true });
        }
      } catch {
        bootstrappedRaceRef.current = null;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [liveRaceId, betfairStatus?.configured, liveRunnerCount, fetchRaceAction]);

  // Poll Betfair exchange prices every second for the live race.
  useEffect(() => {
    if (!liveRaceId || !betfairStatus?.connected) {
      setLivePolling(false);
      return;
    }

    setLivePolling(true);

    const poll = async () => {
      if (exchangeInFlightRef.current) return;
      exchangeInFlightRef.current = true;
      try {
        await fetchRaceAction(liveRaceId, "exchange", { silent: true });
      } catch {
        // Keep polling — transient Betfair errors are normal near the off.
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
  }, [liveRaceId, betfairStatus?.connected, fetchRaceAction]);

  async function handleFetchToday() {
    setFetchingToday(true);
    setError(null);
    try {
      const res = await fetch("/api/races/today", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch today's schedule");
      setRaces(json.races ?? []);
      onScheduleLoaded?.();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setFetchingToday(false);
    }
  }

  async function fetchDirectMarket() {
    setDirectMarketLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/betfair/market", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketIdOrUrl: directMarketUrl }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch Betfair market");
      setDirectMarket(json.market);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setDirectMarketLoading(false);
    }
  }

  async function runRaceAction(raceId: string, action: RaceAction) {
    await fetchRaceAction(raceId, action);
  }

  function toggleExpanded(raceId: string) {
    const willOpen = !expanded[raceId];
    setExpanded((prev) => ({ ...prev, [raceId]: willOpen }));
    if (willOpen) {
      const race = races.find((r) => r.id === raceId);
      if (race && race.runners.length === 0 && race.raceUrl) {
        void fetchRaceAction(raceId, "card");
      }
    }
  }

  function addPriceAlert(
    runnerId: number,
    horseName: string,
    side: AlertSide,
    comparator: AlertComparator,
    targetPrice: number
  ) {
    if (!Number.isFinite(targetPrice) || targetPrice < 1.01) return;

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }

    const id = `${runnerId}-${side}-${comparator}-${targetPrice}`;
    setPriceAlerts((prev) => {
      const without = prev.filter((a) => a.id !== id);
      return [...without, { id, runnerId, horseName, side, comparator, targetPrice }];
    });
    triggeredAlertIdsRef.current.delete(id);
  }

  return (
    <section className="space-y-4">
      {priceHits.length > 0 ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md space-y-3">
            {priceHits.map((hit) => (
              <div
                key={hit.alert.id}
                className="rounded-xl border-2 border-betfair-yellow bg-white p-5 shadow-2xl"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Bell className="h-6 w-6 text-betfair-yellow" />
                    <h3 className="text-lg font-bold text-betfair-navy">Price hit!</h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissPriceHit(hit.alert.id)}
                    className="text-betfair-muted hover:text-betfair-navy"
                    aria-label="Dismiss"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <p className="mt-2 text-sm text-betfair-muted">
                  {hit.raceCourse} · {formatTime(hit.raceTime)}
                </p>
                <p className="mt-3 text-xl font-bold text-betfair-navy">{hit.alert.horseName}</p>
                <p className="mt-1 text-sm">
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 font-semibold",
                      hit.alert.side === "back"
                        ? "bg-[#a6d8ff] text-[#1a3d5c]"
                        : "bg-[#fac9d4] text-[#5c1a2e]"
                    )}
                  >
                    {hit.alert.side === "back" ? "Back" : "Lay"}
                  </span>{" "}
                  target{" "}
                  <strong>
                    {formatComparator(hit.alert.comparator)} {hit.alert.targetPrice.toFixed(2)}
                  </strong>
                  {" · "}now <strong>{hit.currentPrice.toFixed(2)}</strong>
                </p>
                <Button
                  onClick={() => dismissPriceHit(hit.alert.id)}
                  className="mt-4 w-full bg-betfair-yellow text-betfair-navy hover:bg-betfair-yellow/90"
                >
                  OK
                </Button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-betfair-navy">Today&apos;s Racing</h2>
          <p className="text-sm text-betfair-muted">
            {todayLabel} · UK time · Auto-opens nearest race · Betfair refresh 1s
          </p>
        </div>
        <Button
          onClick={handleFetchToday}
          disabled={fetchingToday}
          className="bg-betfair-yellow text-betfair-navy hover:bg-betfair-yellow/90"
        >
          {fetchingToday ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          Get Today&apos;s Schedule
        </Button>
      </div>

      {betfairStatus && !betfairStatus.configured ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">Betfair Exchange not connected</p>
          <p className="mt-1 text-amber-800/90">{betfairStatus.message}</p>
          <p className="mt-2 text-xs text-amber-800/80">
            Add <code className="rounded bg-white px-1">BETFAIR_APP_KEY</code>,{" "}
            <code className="rounded bg-white px-1">BETFAIR_USERNAME</code>, and{" "}
            <code className="rounded bg-white px-1">BETFAIR_PASSWORD</code> to Vercel.
            On Vercel you also need <code className="rounded bg-white px-1">BETFAIR_CERT_PEM</code> and{" "}
            <code className="rounded bg-white px-1">BETFAIR_KEY_PEM</code> (password login is blocked from cloud servers).
            Get a delayed app key and API certificate at{" "}
            <a
              href="https://developer.betfair.com/"
              className="underline"
              target="_blank"
              rel="noreferrer"
            >
              developer.betfair.com
            </a>
            .
          </p>
        </div>
      ) : betfairStatus?.configured ? (
        <div
          className={cn(
            "rounded-lg border px-4 py-2 text-xs",
            betfairStatus.connected
              ? "border-green-200 bg-green-50 text-betfair-green"
              : "border-red-200 bg-red-50 text-betfair-red"
          )}
        >
          <div className="flex flex-wrap items-center gap-2">
            <span>Betfair Exchange: {betfairStatus.message}</span>
            {liveRaceId && betfairStatus.connected ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-betfair-yellow/30 px-2 py-0.5 font-semibold text-betfair-navy">
                <Radio className={cn("h-3 w-3", livePolling && "animate-pulse")} />
                Live {formatTime(races.find((r) => r.id === liveRaceId)?.raceTime ?? "")} · 1s refresh
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {betfairStatus?.configured ? (
        <details
          className="betfair-card"
          open={showAdvancedLookup}
          onToggle={(e) => setShowAdvancedLookup((e.target as HTMLDetailsElement).open)}
        >
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-betfair-navy">
            Advanced: look up any Betfair market by URL
          </summary>
          <div className="space-y-3 border-t border-betfair-border px-4 pb-4 pt-3">
            <input
              type="text"
              value={directMarketUrl}
              onChange={(e) => setDirectMarketUrl(e.target.value)}
              placeholder="Paste Betfair market URL (optional — races auto-match)"
              className="w-full rounded-md border border-betfair-border px-3 py-2 text-sm text-betfair-navy"
            />
            <Button
              onClick={fetchDirectMarket}
              disabled={directMarketLoading || !directMarketUrl.trim()}
              className="bg-betfair-yellow text-betfair-navy hover:bg-betfair-yellow/90"
            >
              {directMarketLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <TrendingUp className="h-4 w-4" />
              )}
              Fetch market
            </Button>
            {directMarket ? <BetfairMarketTable market={directMarket} /> : null}
          </div>
        </details>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-betfair-red">
          {error}
        </div>
      ) : null}

      <div className="betfair-card overflow-hidden">
        <div className="border-b border-betfair-border px-5 py-3 text-xs text-betfair-muted">
          {loading
            ? "Loading…"
            : races.length === 0
              ? "No races loaded — click Get Today's Schedule to fetch from Racing Post"
              : `${races.length} races · Card (RP + Betfair) · Exchange refreshes · Results`}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-betfair-border bg-betfair-surface text-xs uppercase tracking-wider text-betfair-muted">
                <th className="w-8 px-3 py-3" />
                <th className="px-3 py-3 font-semibold">Time</th>
                <th className="px-3 py-3 font-semibold">Course</th>
                <th className="px-3 py-3 font-semibold">Race</th>
                <th className="px-3 py-3 font-semibold">Dist</th>
                <th className="px-3 py-3 font-semibold">Runners</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-5 py-3 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-betfair-muted">
                    <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin" />
                    Loading today&apos;s races…
                  </td>
                </tr>
              ) : races.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-betfair-muted">
                    Click <strong>Get Today&apos;s Schedule</strong> to pull racecards from
                    Racing Post
                  </td>
                </tr>
              ) : (
                races.map((race) => {
                  const isOpen = expanded[race.id];
                  const isLive = race.id === liveRaceId;
                  const isEdge = race.qualifying;
                  const busy = actionLoading[race.id];
                  const declaredRunners =
                    race.runnerCount > 0 ? race.runnerCount : (race.fieldSize ?? 0);
                  const canExpand = declaredRunners > 0;
                  return (
                    <Fragment key={race.id}>
                      <tr
                        ref={isLive || race.id === focusRaceId ? liveRowRef : undefined}
                        className={cn(
                          "border-b border-betfair-border/60 hover:bg-betfair-surface/60",
                          isEdge && "bg-green-50/70 ring-1 ring-inset ring-betfair-green/40",
                          isLive && !isEdge && "bg-betfair-yellow/10 ring-1 ring-inset ring-betfair-yellow/50",
                          isLive && isEdge && "bg-green-50 ring-2 ring-inset ring-betfair-green/60"
                        )}
                      >
                        <td className="px-3 py-3">
                          {canExpand ? (
                            <button
                              type="button"
                              onClick={() => toggleExpanded(race.id)}
                              className="text-betfair-muted hover:text-betfair-navy"
                              aria-label={isOpen ? "Collapse runners" : "Expand runners"}
                            >
                              {isOpen ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </button>
                          ) : null}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 font-mono text-betfair-navy">
                          <span className="inline-flex items-center gap-1">
                            <Clock className="h-3 w-3 text-betfair-muted" />
                            {formatTime(race.raceTime)}
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
                        <td className="px-3 py-3 font-medium text-betfair-navy">
                          {race.course}
                        </td>
                        <td className="max-w-xs px-3 py-3 text-betfair-navy">
                          <p className="truncate">{race.raceName ?? "—"}</p>
                          {isEdge && race.edgePickHorse ? (
                            <p className="mt-0.5 flex items-center gap-1 text-xs font-semibold text-betfair-green">
                              <Trophy className="h-3 w-3" />
                              Pick: {race.edgePickHorse}
                            </p>
                          ) : null}
                          <p className="text-xs text-betfair-muted">
                            {race.isHandicap ? "Handicap" : "Non-hcap"}
                            {race.isTurf ? " · Turf" : " · AW"}
                            {race.betfairMarketId ? (
                              <>
                                {" · "}
                                <a
                                  href={race.betfairMarketUrl ?? "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-700 hover:underline"
                                >
                                  Betfair linked
                                </a>
                              </>
                            ) : null}
                            {race.marketTotalMatched !== null
                              ? ` · Matched ${formatGbp(race.marketTotalMatched)}`
                              : ""}
                          </p>
                        </td>
                        <td className="px-3 py-3">
                          {race.distanceBand ? (
                            <span className="rounded bg-betfair-yellow/20 px-1.5 py-0.5 text-xs font-semibold text-[#9a6700]">
                              {race.distanceBand}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3 text-betfair-muted">
                          {declaredRunners > 0 ? declaredRunners : "—"}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                              statusClass(race.status, race.hasExchangeOdds)
                            )}
                          >
                            {statusLabel(race.status, race.hasExchangeOdds)}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-wrap justify-end gap-1.5">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => runRaceAction(race.id, "card")}
                              disabled={Boolean(busy)}
                              className="h-7 border-betfair-border text-xs"
                              title="Load Racing Post card and auto-fetch Betfair prices"
                            >
                                {busy === "card" ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-3 w-3" />
                                )}
                                Card
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                              onClick={() => runRaceAction(race.id, "exchange")}
                              disabled={Boolean(busy) || !betfairStatus?.configured}
                              className="h-7 border-betfair-yellow/60 bg-betfair-yellow/10 text-xs font-semibold text-betfair-navy"
                              title="Refresh Betfair prices (market auto-matched by course and time)"
                            >
                                {busy === "exchange" ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <TrendingUp className="h-3 w-3" />
                                )}
                                Exchange
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => runRaceAction(race.id, "results")}
                                disabled={Boolean(busy)}
                                className="h-7 border-betfair-border text-xs"
                              >
                                {busy === "results" ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  <Trophy className="h-3 w-3" />
                                )}
                              Results
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {isOpen ? (
                        <tr className="bg-betfair-surface/40">
                          <td colSpan={8} className="px-5 py-4">
                            {race.runners.length > 0 ? (
                              <RunnersSubTable
                                race={race}
                                isLive={isLive}
                                livePolling={livePolling}
                                priceAlerts={isLive ? priceAlerts : []}
                                onAddAlert={addPriceAlert}
                                onRemoveAlert={removePriceAlert}
                              />
                            ) : (
                              <div className="flex flex-col items-center gap-3 py-6 text-center text-sm text-betfair-muted">
                                {busy === "card" ? (
                                  <>
                                    <Loader2 className="h-5 w-5 animate-spin text-betfair-yellow" />
                                    Loading race card…
                                  </>
                                ) : (
                                  <>
                                    <p>
                                      Runner details not loaded yet — click{" "}
                                      <strong>Card</strong> to pull names, odds, and picks.
                                    </p>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => runRaceAction(race.id, "card")}
                                      disabled={Boolean(busy)}
                                      className="border-betfair-border"
                                    >
                                      <RefreshCw className="h-3.5 w-3.5" />
                                      Load Card
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

function BetfairMarketTable({ market }: { market: BetfairMarketView }) {
  return (
    <div className="space-y-2 rounded-lg border border-betfair-border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold text-betfair-navy">
            {market.venue ? `${market.venue} · ` : ""}
            {market.marketName}
          </p>
          <p className="text-xs text-betfair-muted">
            Market {market.marketId}
            {market.marketTotalMatched !== null
              ? ` · Matched ${formatGbp(market.marketTotalMatched)}`
              : ""}
          </p>
        </div>
        <a
          href={market.marketUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:underline"
        >
          Open on Betfair <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      <div className="overflow-x-auto">
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
            {market.runners.map((runner) => (
              <tr key={runner.horseName} className="border-b border-betfair-border/50 last:border-0">
                <td className="px-2 py-2 font-medium text-betfair-navy">{runner.horseName}</td>
                <PriceCell price={runner.backPrice} size={runner.backSize} type="back" />
                <PriceCell price={runner.layPrice} size={runner.laySize} type="lay" />
                <td className="px-2 py-2 font-mono text-betfair-muted">
                  {formatGbp(runner.matchedVolume)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RunnersSubTable({
  race,
  isLive = false,
  livePolling = false,
  priceAlerts = [],
  onAddAlert,
  onRemoveAlert,
}: {
  race: LiveRaceDto;
  isLive?: boolean;
  livePolling?: boolean;
  priceAlerts?: PriceAlert[];
  onAddAlert?: (
    runnerId: number,
    horseName: string,
    side: AlertSide,
    comparator: AlertComparator,
    target: number
  ) => void;
  onRemoveAlert?: (alertId: string) => void;
}) {
  const [alertRunnerId, setAlertRunnerId] = useState<number>(
    () => race.runners[0]?.id ?? 0
  );
  const [alertSide, setAlertSide] = useState<AlertSide>("back");
  const [alertComparator, setAlertComparator] = useState<AlertComparator>("eq");
  const [alertPrice, setAlertPrice] = useState("");

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          {race.oddsFetchedAt ? (
            <p className="text-[10px] text-betfair-muted">
              Prices updated {format(new Date(race.oddsFetchedAt), "HH:mm:ss")}
              {race.marketTotalMatched !== null
                ? ` · Market matched ${formatGbp(race.marketTotalMatched)}`
                : ""}
            </p>
          ) : null}
          {isLive && livePolling ? (
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-betfair-navy">
              <Radio className="h-3 w-3 animate-pulse text-betfair-green" />
              Auto-refreshing Betfair every 1s
            </span>
          ) : null}
        </div>
        {race.betfairMarketUrl ? (
          <a
            href={race.betfairMarketUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-700 hover:underline"
          >
            Betfair market <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>

      {isLive && onAddAlert ? (
        <div className="rounded-lg border border-betfair-yellow/50 bg-betfair-yellow/5 p-3">
          <p className="mb-2 text-xs font-semibold text-betfair-navy">
            <Bell className="mr-1 inline h-3.5 w-3.5" />
            Price alert (live race · checks every 1s)
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-[10px] text-betfair-muted">
              Horse
              <select
                value={alertRunnerId}
                onChange={(e) => setAlertRunnerId(Number(e.target.value))}
                className="rounded border border-betfair-border bg-white px-2 py-1.5 text-xs text-betfair-navy"
              >
                {race.runners.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.horseName}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-betfair-muted">
              Side
              <select
                value={alertSide}
                onChange={(e) => setAlertSide(e.target.value as AlertSide)}
                className="rounded border border-betfair-border bg-white px-2 py-1.5 text-xs text-betfair-navy"
              >
                <option value="back">Back</option>
                <option value="lay">Lay</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-betfair-muted">
              Condition
              <select
                value={alertComparator}
                onChange={(e) => setAlertComparator(e.target.value as AlertComparator)}
                className="min-w-[160px] rounded border border-betfair-border bg-white px-2 py-1.5 text-xs text-betfair-navy"
              >
                {COMPARATOR_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] text-betfair-muted">
              Target price
              <input
                type="number"
                step="0.01"
                min="1.01"
                value={alertPrice}
                onChange={(e) => setAlertPrice(e.target.value)}
                placeholder="e.g. 3.65"
                className="w-24 rounded border border-betfair-border bg-white px-2 py-1.5 text-xs text-betfair-navy"
              />
            </label>
            <Button
              size="sm"
              type="button"
              className="h-8 bg-betfair-yellow text-xs text-betfair-navy hover:bg-betfair-yellow/90"
              onClick={() => {
                const runner = race.runners.find((r) => r.id === alertRunnerId);
                const price = Number(alertPrice);
                if (runner && onAddAlert) {
                  onAddAlert(runner.id, runner.horseName, alertSide, alertComparator, price);
                  setAlertPrice("");
                }
              }}
            >
              Set alert
            </Button>
          </div>
          {priceAlerts.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {priceAlerts.map((alert) => (
                <li
                  key={alert.id}
                  className="flex items-center justify-between rounded bg-white px-2 py-1 text-[11px] text-betfair-navy"
                >
                  <span>
                    {alert.horseName} — {alert.side}{" "}
                    <strong>
                      {formatComparator(alert.comparator)} {alert.targetPrice.toFixed(2)}
                    </strong>
                  </span>
                  {onRemoveAlert ? (
                    <button
                      type="button"
                      onClick={() => onRemoveAlert(alert.id)}
                      className="text-betfair-muted hover:text-betfair-red"
                      aria-label="Remove alert"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[10px] text-betfair-muted">
              Watches the live {alertSide} price on each 1s refresh
            </p>
          )}
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border border-betfair-border bg-white">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-betfair-border text-betfair-muted">
              <th className="px-3 py-2 font-semibold">Horse</th>
              <th className="px-3 py-2 font-semibold">Jockey</th>
              <th className="px-3 py-2 font-semibold">OR</th>
              <th className="px-3 py-2 font-semibold">RP Forecast</th>
              <th className="px-2 py-2 text-center font-semibold">Back</th>
              <th className="px-2 py-2 text-center font-semibold">Lay</th>
              <th className="px-3 py-2 font-semibold">Matched</th>
              <th className="px-3 py-2 font-semibold">Result</th>
              <th className="px-3 py-2 font-semibold">SP</th>
            </tr>
          </thead>
          <tbody>
            {race.runners.map((runner) => (
              <tr
                key={runner.id}
                className={cn(
                  "border-b border-betfair-border/50 last:border-0",
                  runner.qualifies && "bg-green-50/90 ring-1 ring-inset ring-betfair-green/30"
                )}
              >
                <td className="px-3 py-2 font-medium text-betfair-navy">
                  {runner.horseName}
                  {runner.qualifies ? (
                    <span className="ml-1.5 rounded bg-betfair-green px-1.5 py-0.5 text-[10px] font-bold text-white">
                      PICK
                    </span>
                  ) : null}
                  {runner.isFavourite && !runner.qualifies ? (
                    <span className="ml-1 text-[10px] font-bold text-betfair-yellow">FAV</span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-betfair-muted">{runner.jockey ?? "—"}</td>
                <td className="px-3 py-2 font-mono">{runner.officialRating ?? "—"}</td>
                <td className="px-3 py-2 font-mono text-betfair-muted">
                  {formatOdds(runner.morningPrice)}
                </td>
                <PriceCell price={runner.exchangePrice} size={runner.backSize} type="back" />
                <PriceCell price={runner.exchangeLayPrice} size={runner.laySize} type="lay" />
                <td className="px-3 py-2 font-mono text-betfair-muted">
                  {formatGbp(runner.matchedVolume)}
                </td>
                <td className="px-3 py-2">
                  {runner.finishPosition !== null ? (
                    <span
                      className={cn(
                        "font-semibold",
                        runner.isWinner && "text-betfair-green",
                        !runner.isWinner && runner.isPlaced && "text-blue-600",
                        !runner.isWinner && !runner.isPlaced && "text-betfair-muted"
                      )}
                    >
                      {runner.isWinner
                        ? `Won (${runner.finishPosition})`
                        : runner.isPlaced
                          ? `Placed (${runner.finishPosition})`
                          : `${runner.finishPosition}th`}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 font-mono">{formatOdds(runner.spDecimal)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

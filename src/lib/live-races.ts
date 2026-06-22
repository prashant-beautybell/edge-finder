import { prisma } from "@/lib/db";
import { getBetfairSetupError } from "@/lib/betfair-config";
import {
  findWinMarket,
  getExchangeOddsByMarketId,
  getExchangeOddsForRace,
  betfairMarketUrl,
  normalizeHorseName,
  parseBetfairMarketId,
} from "@/lib/sources/betfair";
import {
  fetchMeetings,
  fetchRaceCard,
  fetchResult,
  toRaceCardUrl,
  toResultUrl,
  type RpRace,
} from "@/lib/sources/racingpost";
import { evaluateRaceFromCard } from "@/lib/live/edge-picks";
import { settleRaceFromResults } from "@/lib/live/settlement";
import { clearDashboardCache } from "@/lib/dashboard-cache";

function resultUrlFromRaceUrl(raceUrl: string | null): string | null {
  if (!raceUrl) return null;
  return toResultUrl(raceUrl);
}

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

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function endOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
  );
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseRpDateTime(value: string | null): { raceDate: Date; raceTime: Date } {
  const now = new Date();
  if (!value) {
    const day = startOfDay(now);
    return { raceDate: day, raceTime: now };
  }

  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}:00`;
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    const day = startOfDay(now);
    return { raceDate: day, raceTime: now };
  }

  const raceDate = new Date(
    Date.UTC(parsed.getFullYear(), parsed.getMonth(), parsed.getDate())
  );
  return { raceDate, raceTime: parsed };
}

function todayRange(date = new Date()) {
  return {
    from: startOfDay(date),
    to: endOfDay(date),
    label: formatDate(date),
  };
}

function findRunnerPrice(
  prices: Map<string, import("@/lib/sources/betfair").BetfairRunnerPrice & { horseName: string }>,
  horseName: string
) {
  const key = normalizeHorseName(horseName);
  const direct = prices.get(key);
  if (direct) return direct;

  for (const [priceKey, price] of Array.from(prices.entries())) {
    if (priceKey === key) return price;
    if (priceKey.startsWith(key) || key.startsWith(priceKey)) return price;
    const priceBase = priceKey.split(" ")[0];
    const runnerBase = key.split(" ")[0];
    if (priceBase.length > 2 && priceBase === runnerBase) return price;
  }

  return undefined;
}

function mapRaceToDto(
  race: {
    id: string;
    course: string;
    raceTime: Date;
    raceName: string | null;
    raceType: string | null;
    distanceBand: string | null;
    going: string | null;
    fieldSize: number | null;
    isHandicap: boolean;
    isTurf: boolean;
    status: string;
    qualifying: boolean;
    raceUrl: string | null;
    betfairMarketId: string | null;
    marketTotalMatched: { toString(): string } | null;
    runners: Array<{
      id: number;
      horseName: string;
      jockey: string | null;
      trainer: string | null;
      officialRating: number | null;
      weightTotalLbs: number | null;
      finishPosition: number | null;
      spDecimal: { toString(): string } | null;
      isWinner: boolean | null;
      isPlaced: boolean | null;
      isFavourite: boolean | null;
      qualifies: boolean;
      disqualifyReason: string | null;
    }>;
    liveOdds: Array<{
      horseName: string | null;
      morningPrice: { toString(): string } | null;
      betfairPrice: { toString(): string } | null;
      layPrice: { toString(): string } | null;
      backSize: { toString(): string } | null;
      laySize: { toString(): string } | null;
      isFavourite: boolean | null;
      matchedVolume: { toString(): string } | null;
      fetchedAt: Date;
    }>;
  }
): LiveRaceDto {
  const oddsByHorse = new Map<string, (typeof race.liveOdds)[number]>();
  for (const odds of race.liveOdds) {
    if (odds.horseName) {
      const key = odds.horseName.toLowerCase();
      if (!oddsByHorse.has(key)) {
        oddsByHorse.set(key, odds);
      }
    }
  }

  const latestFetch = race.liveOdds[0]?.fetchedAt ?? null;
  const marketTotalMatched = race.marketTotalMatched
    ? Number(race.marketTotalMatched)
    : null;

  const runners: LiveRunnerDto[] = race.runners.map((runner) => {
    const odds = oddsByHorse.get(runner.horseName.toLowerCase());
    const exchangePrice = odds?.betfairPrice ? Number(odds.betfairPrice) : null;
    const exchangeLayPrice = odds?.layPrice ? Number(odds.layPrice) : null;
    const morningPrice = odds?.morningPrice ? Number(odds.morningPrice) : null;
    return {
      id: runner.id,
      horseName: runner.horseName,
      jockey: runner.jockey,
      trainer: runner.trainer,
      officialRating: runner.officialRating,
      weightTotalLbs: runner.weightTotalLbs,
      morningPrice,
      exchangePrice,
      exchangeLayPrice,
      backSize: odds?.backSize ? Number(odds.backSize) : null,
      laySize: odds?.laySize ? Number(odds.laySize) : null,
      latestPrice: exchangePrice ?? morningPrice,
      matchedVolume: odds?.matchedVolume ? Number(odds.matchedVolume) : null,
      isFavourite: runner.isFavourite ?? odds?.isFavourite ?? null,
      finishPosition: runner.finishPosition,
      spDecimal: runner.spDecimal ? Number(runner.spDecimal) : null,
      isWinner: runner.isWinner,
      isPlaced: runner.isPlaced,
      qualifies: runner.qualifies,
      disqualifyReason: runner.disqualifyReason,
    };
  });

  const edgePickHorse =
    runners.find((r) => r.qualifies)?.horseName ??
    runners.find((r) => r.isFavourite)?.horseName ??
    null;

  const hasOdds = race.liveOdds.some((o) => o.morningPrice !== null);
  const hasExchangeOdds = race.liveOdds.some((o) => o.betfairPrice !== null);
  const hasResults = race.runners.some((r) => r.finishPosition !== null);

  return {
    id: race.id,
    course: race.course,
    raceTime: race.raceTime.toISOString(),
    raceName: race.raceName,
    raceType: race.raceType,
    distanceBand: race.distanceBand,
    going: race.going,
    fieldSize: race.fieldSize,
    isHandicap: race.isHandicap,
    isTurf: race.isTurf,
    status: race.status,
    qualifying: race.qualifying,
    edgePickHorse,
    runnerCount: race.runners.length,
    hasOdds,
    hasExchangeOdds,
    hasResults,
    raceUrl: race.raceUrl,
    betfairMarketId: race.betfairMarketId,
    betfairMarketUrl: race.betfairMarketId ? betfairMarketUrl(race.betfairMarketId) : null,
    marketTotalMatched,
    oddsFetchedAt: latestFetch?.toISOString() ?? null,
    runners,
  };
}

async function raceInclude() {
  return {
    runners: { orderBy: { id: "asc" as const } },
    liveOdds: { orderBy: { fetchedAt: "desc" as const } },
  };
}

export async function listTodayRaces(date = new Date()): Promise<LiveRaceDto[]> {
  const { from, to } = todayRange(date);
  const races = await prisma.race.findMany({
    where: { raceDate: { gte: from, lte: to } },
    include: await raceInclude(),
    orderBy: [{ raceTime: "asc" }],
  });

  return races.map(mapRaceToDto);
}

async function upsertMeetingRace(rpRace: RpRace) {
  const { raceDate, raceTime } = parseRpDateTime(rpRace.startDateTime);

  return prisma.race.upsert({
    where: { id: rpRace.raceId },
    create: {
      id: rpRace.raceId,
      raceDate,
      raceTime,
      course: rpRace.course,
      raceName: rpRace.raceTitle,
      raceType: rpRace.raceTypeCode,
      distanceYards: rpRace.distanceYards,
      distanceBand: rpRace.distanceBand,
      going: rpRace.going,
      fieldSize: rpRace.fieldSize,
      isHandicap: rpRace.isHandicap,
      isTurf: rpRace.isTurf,
      raceUrl: toRaceCardUrl(rpRace.raceUrl || ""),
      resultUrl: rpRace.resultUrl ?? toResultUrl(rpRace.raceUrl || ""),
      status: rpRace.isResult ? "resulted" : "scheduled",
      scrapedAt: new Date(),
    },
    update: {
      raceDate,
      raceTime,
      course: rpRace.course,
      raceName: rpRace.raceTitle,
      raceType: rpRace.raceTypeCode,
      distanceYards: rpRace.distanceYards,
      distanceBand: rpRace.distanceBand,
      going: rpRace.going,
      fieldSize: rpRace.fieldSize,
      isHandicap: rpRace.isHandicap,
      isTurf: rpRace.isTurf,
      raceUrl: toRaceCardUrl(rpRace.raceUrl || ""),
      resultUrl: rpRace.resultUrl ?? toResultUrl(rpRace.raceUrl || ""),
      status: rpRace.isResult ? "resulted" : undefined,
      scrapedAt: new Date(),
    },
  });
}

export async function syncTodayMeetings(date = new Date()) {
  const { label } = todayRange(date);
  const datePath =
    formatDate(date) === formatDate(new Date())
      ? "/racecards/"
      : `/racecards/${formatDate(date)}`;

  const meetings = await fetchMeetings(datePath);

  for (const rpRace of meetings) {
    await upsertMeetingRace(rpRace);
  }

  const races = await listTodayRaces(date);
  return {
    date: label,
    imported: meetings.length,
    races,
  };
}

/** Resolve and store Betfair WIN market id from course + off time (no prices). */
export async function linkBetfairMarketForRace(raceId: string): Promise<string | null> {
  if (getBetfairSetupError()) return null;

  const race = await prisma.race.findUnique({ where: { id: raceId } });
  if (!race) return null;
  if (race.betfairMarketId) return race.betfairMarketId;

  const found = await findWinMarket(
    race.course,
    race.raceTime,
    race.raceName,
    race.fieldSize
  );
  if (!found) return null;

  await prisma.race.update({
    where: { id: raceId },
    data: { betfairMarketId: found.marketId },
  });

  return found.marketId;
}

export async function refreshRaceCard(raceId: string) {
  const existing = await prisma.race.findUnique({
    where: { id: raceId },
    include: { liveOdds: true },
  });
  if (!existing?.raceUrl) {
    throw new Error("Race not found or missing Racing Post URL. Fetch today's schedule first.");
  }

  const preservedExchange = new Map(
    existing.liveOdds.map((o) => [
      o.horseName?.toLowerCase() ?? "",
      {
        betfairPrice: o.betfairPrice,
        layPrice: o.layPrice,
        backSize: o.backSize,
        laySize: o.laySize,
        matchedVolume: o.matchedVolume,
        priceDriftPct: o.priceDriftPct,
      },
    ])
  );

  const cardUrl = toRaceCardUrl(existing.raceUrl);
  if (cardUrl !== existing.raceUrl) {
    await prisma.race.update({
      where: { id: raceId },
      data: { raceUrl: cardUrl },
    });
  }

  const card = await fetchRaceCard(cardUrl);
  const activeRunners = card.runners.filter((r) => !r.nonRunner);

  const favOdds = activeRunners
    .map((r) => r.forecastOdds)
    .filter((v): v is number => v !== null);
  const minOdds = favOdds.length ? Math.min(...favOdds) : null;

  await prisma.runner.deleteMany({ where: { raceId } });
  await prisma.liveOdds.deleteMany({ where: { raceId } });

  const now = new Date();
  const runnerRows = activeRunners.map((runner) => {
    const isFavourite =
      minOdds !== null &&
      runner.forecastOdds !== null &&
      Math.abs(runner.forecastOdds - minOdds) < 0.01;

    return {
      raceId,
      horseName: runner.horseName,
      jockey: runner.jockeyName,
      trainer: runner.trainerName,
      officialRating: runner.officialRatingToday,
      weightStone: runner.weightStone,
      weightLbs: runner.weightLbs,
      weightTotalLbs: runner.weightTotalLbs,
      isFavourite,
    };
  });

  if (runnerRows.length > 0) {
    await prisma.runner.createMany({ data: runnerRows });
  }

  const oddsRows = activeRunners
    .filter((r) => r.forecastOdds !== null)
    .map((runner) => {
      const preserved = preservedExchange.get(runner.horseName.toLowerCase());
      return {
        raceId,
        horseName: runner.horseName,
        morningPrice: runner.forecastOdds,
        betfairPrice: preserved?.betfairPrice ?? null,
        layPrice: preserved?.layPrice ?? null,
        backSize: preserved?.backSize ?? null,
        laySize: preserved?.laySize ?? null,
        matchedVolume: preserved?.matchedVolume ?? null,
        priceDriftPct: preserved?.priceDriftPct ?? null,
        isFavourite:
          minOdds !== null &&
          runner.forecastOdds !== null &&
          Math.abs(runner.forecastOdds - minOdds) < 0.01,
        fetchedAt: now,
      };
    });

  if (oddsRows.length > 0) {
    await prisma.liveOdds.createMany({ data: oddsRows });
  }

  await prisma.race.update({
    where: { id: raceId },
    data: {
      fieldSize: activeRunners.length,
      distanceYards: card.race.distanceYards,
      distanceBand: card.race.distanceBand,
      going: card.race.going,
      isHandicap: card.race.isHandicap,
      isTurf: card.race.isTurf,
      raceName: card.race.raceTitle,
      raceType: card.race.raceTypeCode,
      resultUrl: card.race.resultUrl ?? existing.resultUrl,
      status: card.race.isResult ? "resulted" : "card_loaded",
      scrapedAt: now,
    },
  });

  const updated = await prisma.race.findUnique({
    where: { id: raceId },
    include: await raceInclude(),
  });

  if (!updated) throw new Error("Race disappeared after refresh");

  try {
    await evaluateRaceFromCard(raceId, card);
  } catch (error) {
    console.error(`Edge evaluation failed for ${raceId}:`, error);
  }

  await linkBetfairMarketForRace(raceId);

  const afterEdge = await prisma.race.findUnique({
    where: { id: raceId },
    include: await raceInclude(),
  });

  if (!afterEdge) throw new Error("Race disappeared after edge evaluation");

  if (!getBetfairSetupError() && afterEdge.runners.length > 0) {
    try {
      return (await syncBetfairOdds(raceId)).race;
    } catch {
      // Exchange may not be open yet — card data is still valid
    }
  }

  const withMarket = await prisma.race.findUnique({
    where: { id: raceId },
    include: await raceInclude(),
  });

  return mapRaceToDto(withMarket ?? afterEdge);
}

export async function syncBetfairOdds(
  raceId: string,
  options?: { marketIdOrUrl?: string }
) {
  const setupError = getBetfairSetupError();
  if (setupError) {
    throw new Error(setupError);
  }

  const race = await prisma.race.findUnique({
    where: { id: raceId },
    include: { runners: true, liveOdds: true },
  });

  if (!race) {
    throw new Error("Race not found. Fetch today's schedule first.");
  }

  const parsedMarketId = options?.marketIdOrUrl
    ? parseBetfairMarketId(options.marketIdOrUrl)
    : null;
  let marketIdOverride = parsedMarketId ?? race.betfairMarketId;

  if (!marketIdOverride) {
    marketIdOverride = await linkBetfairMarketForRace(raceId);
  }

  let exchange:
    | Awaited<ReturnType<typeof getExchangeOddsForRace>>
    | Awaited<ReturnType<typeof getExchangeOddsByMarketId>>;

  if (race.runners.length === 0 && marketIdOverride) {
    exchange = await getExchangeOddsByMarketId(marketIdOverride);
    await prisma.runner.deleteMany({ where: { raceId } });
    const runnerRows = Array.from(exchange.prices.values()).map((p) => ({
      raceId,
      horseName: p.horseName,
      jockey: null,
      trainer: null,
      officialRating: null,
      weightStone: null,
      weightLbs: null,
      weightTotalLbs: null,
      isFavourite: false,
    }));
    if (runnerRows.length > 0) {
      await prisma.runner.createMany({ data: runnerRows });
    }
    race.runners = await prisma.runner.findMany({ where: { raceId } });
  } else if (race.runners.length === 0) {
    throw new Error(
      "Load the racecard first (Card button), paste a Betfair market URL, then fetch Exchange prices."
    );
  } else {
    exchange = await getExchangeOddsForRace(
      race.course,
      race.raceTime,
      race.raceName,
      race.runners.map((r) => r.horseName),
      marketIdOverride
    );
  }

  const now = new Date();
  const existingOdds = new Map(
    race.liveOdds.map((o) => [o.horseName?.toLowerCase() ?? "", o])
  );

  let bestPrice: number | null = null;
  for (const runner of race.runners) {
    const price = findRunnerPrice(exchange.prices, runner.horseName);
    const backPrice = price?.bestBackPrice ?? null;
    if (backPrice !== null && (bestPrice === null || backPrice < bestPrice)) {
      bestPrice = backPrice;
    }
  }

  const oddsRows = race.runners.map((runner) => {
    const price = findRunnerPrice(exchange.prices, runner.horseName);
    const backPrice = price?.bestBackPrice ?? null;
    const layPrice = price?.bestLayPrice ?? null;
    const prev = existingOdds.get(runner.horseName.toLowerCase());
    const morning = prev?.morningPrice ? Number(prev.morningPrice) : null;
    const drift =
      morning !== null && backPrice !== null
        ? ((backPrice - morning) / morning) * 100
        : null;

    return {
      raceId,
      horseName: runner.horseName,
      morningPrice: morning,
      betfairPrice: backPrice,
      layPrice,
      backSize: price?.bestBackSize ?? null,
      laySize: price?.bestLaySize ?? null,
      matchedVolume: price?.totalMatched ?? null,
      priceDriftPct: drift,
      isFavourite:
        backPrice !== null &&
        bestPrice !== null &&
        Math.abs(backPrice - bestPrice) < 0.01,
      fetchedAt: now,
    };
  });

  const matchedCount = oddsRows.filter((r) => r.betfairPrice !== null).length;
  if (matchedCount === 0) {
    throw new Error(
      `Betfair returned no prices for this race (${exchange.marketId}). ` +
        "Paste the Betfair market URL in the field below and click Exchange again."
    );
  }

  await prisma.$transaction([
    prisma.liveOdds.deleteMany({ where: { raceId } }),
    ...(oddsRows.length > 0 ? [prisma.liveOdds.createMany({ data: oddsRows })] : []),
  ]);

  const favRunner = race.runners.find((runner) => {
    const price = findRunnerPrice(exchange.prices, runner.horseName);
    return (
      price?.bestBackPrice !== null &&
      price?.bestBackPrice !== undefined &&
      bestPrice !== null &&
      Math.abs(price.bestBackPrice - bestPrice) < 0.01
    );
  });

  if (favRunner) {
    await prisma.runner.updateMany({
      where: { raceId },
      data: { isFavourite: false },
    });
    await prisma.runner.update({
      where: { id: favRunner.id },
      data: { isFavourite: true },
    });
  }

  await prisma.race.update({
    where: { id: raceId },
    data: {
      betfairMarketId: exchange.marketId,
      marketTotalMatched: exchange.marketTotalMatched,
      status: race.status === "scheduled" ? "card_loaded" : race.status,
      scrapedAt: now,
    },
  });

  const updated = await prisma.race.findUnique({
    where: { id: raceId },
    include: await raceInclude(),
  });

  if (!updated) throw new Error("Race disappeared after Betfair sync");

  const dto = mapRaceToDto(updated);
  if (exchange.marketTotalMatched !== null) {
    dto.marketTotalMatched = exchange.marketTotalMatched;
  }

  return {
    race: dto,
    exchangeMeta: {
      marketId: exchange.marketId,
      marketName: "marketName" in exchange ? exchange.marketName : race.raceName,
      marketTotalMatched: exchange.marketTotalMatched,
      marketUrl: betfairMarketUrl(exchange.marketId),
    },
  };
}

export async function fetchBetfairMarket(marketIdOrUrl: string) {
  const setupError = getBetfairSetupError();
  if (setupError) {
    throw new Error(setupError);
  }

  const marketId = parseBetfairMarketId(marketIdOrUrl);
  if (!marketId) {
    throw new Error(
      "Invalid Betfair market — paste a URL like https://www.betfair.com/exchange/plus/horse-racing/market/1.259190153 or market id 1.259190153"
    );
  }

  const exchange = await getExchangeOddsByMarketId(marketId);
  const runners = Array.from(exchange.prices.values())
    .sort((a, b) => (a.bestBackPrice ?? 999) - (b.bestBackPrice ?? 999))
    .map((p) => ({
      horseName: p.horseName,
      backPrice: p.bestBackPrice,
      backSize: p.bestBackSize,
      layPrice: p.bestLayPrice,
      laySize: p.bestLaySize,
      matchedVolume: p.totalMatched,
    }));

  return {
    marketId: exchange.marketId,
    marketName: exchange.marketName,
    venue: exchange.venue,
    marketStartTime: exchange.marketStartTime,
    marketTotalMatched: exchange.marketTotalMatched,
    marketUrl: betfairMarketUrl(exchange.marketId),
    runners,
  };
}

export async function syncRaceResults(raceId: string) {
  const existing = await prisma.race.findUnique({
    where: { id: raceId },
    include: { runners: true },
  });

  if (!existing) {
    throw new Error("Race not found");
  }

  let resultUrl = existing.resultUrl ?? resultUrlFromRaceUrl(existing.raceUrl);
  if (!resultUrl && existing.raceUrl) {
    const card = await fetchRaceCard(toRaceCardUrl(existing.raceUrl));
    resultUrl = card.race.resultUrl;
  }

  if (!resultUrl) {
    throw new Error("No result URL available for this race yet");
  }

  let results;
  try {
    results = await fetchResult(resultUrl);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("404")) {
      throw new Error(
        "Results not published yet on Racing Post. Try again after the race has finished."
      );
    }
    throw error;
  }

  if (results.length === 0) {
    throw new Error("Racing Post returned no result data for this race");
  }

  const resultMap = new Map(
    results.map((r) => [r.horseName.toLowerCase().trim(), r])
  );

  if (existing.runners.length === 0) {
    await prisma.runner.createMany({
      data: results.map((result) => {
        const finishPos = result.finishPos;
        const won = finishPos === 1;
        const placed = finishPos !== null && finishPos >= 1 && finishPos <= 3;
        return {
          raceId,
          horseName: result.horseName,
          jockey: null,
          trainer: null,
          officialRating: null,
          weightStone: null,
          weightLbs: null,
          weightTotalLbs: null,
          finishPosition: finishPos,
          spDecimal: result.spDecimal,
          isWinner: won,
          isPlaced: placed,
          isFavourite: false,
        };
      }),
    });
  } else {
    for (const runner of existing.runners) {
      const result = resultMap.get(runner.horseName.toLowerCase().trim());
      if (!result) continue;

      const finishPos = result.finishPos;
      const won = finishPos === 1;
      const placed = finishPos !== null && finishPos >= 1 && finishPos <= 3;

      await prisma.runner.update({
        where: { id: runner.id },
        data: {
          finishPosition: finishPos,
          spDecimal: result.spDecimal,
          isWinner: won,
          isPlaced: placed,
        },
      });
    }
  }

  await prisma.race.update({
    where: { id: raceId },
    data: {
      resultUrl,
      fieldSize: results.length,
      status: "resulted",
      scrapedAt: new Date(),
    },
  });

  const settled = await settleRaceFromResults(raceId, results);
  if (settled.settled > 0 || existing.qualifying) {
    clearDashboardCache();
  }

  const updated = await prisma.race.findUnique({
    where: { id: raceId },
    include: await raceInclude(),
  });

  if (!updated) throw new Error("Race disappeared after syncing results");
  return mapRaceToDto(updated);
}

export async function getRaceById(raceId: string) {
  const race = await prisma.race.findUnique({
    where: { id: raceId },
    include: await raceInclude(),
  });
  return race ? mapRaceToDto(race) : null;
}

export interface PendingResultSync {
  raceId: string;
  ok: boolean;
  error?: string;
}

export async function syncPendingRaceResults(
  date = new Date(),
  minMinutesAfterStart = 25
): Promise<PendingResultSync[]> {
  const { from, to } = todayRange(date);
  const cutoff = new Date(Date.now() - minMinutesAfterStart * 60 * 1000);

  const races = await prisma.race.findMany({
    where: {
      raceDate: { gte: from, lte: to },
      status: { not: "resulted" },
      raceTime: { lte: cutoff },
      OR: [
        { qualifying: true },
        { qualifyingBets: { some: { status: { in: ["pending", "alert"] } } } },
      ],
    },
    select: { id: true },
    orderBy: { raceTime: "asc" },
  });

  const outcomes: PendingResultSync[] = [];
  for (const race of races) {
    try {
      await syncRaceResults(race.id);
      outcomes.push({ raceId: race.id, ok: true });
    } catch (error) {
      outcomes.push({
        raceId: race.id,
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }
  return outcomes;
}

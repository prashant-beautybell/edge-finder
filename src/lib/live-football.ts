import { getFootballPrisma } from "@/lib/db-sport";

function db() {
  return getFootballPrisma();
}
import { getFootballRules } from "@/lib/algorithm-config";
import { getBetfairSetupError } from "@/lib/betfair-config";
import {
  betfairFootballMarketUrl,
  getFootballExchangeOdds,
  getFootballMarketById,
  listTodayFootballMarkets,
  normalizeTeamName,
  parseBetfairFootballMarketId,
  ukCalendarDate,
  ukDayBoundsUtc,
  type BetfairFootballMarket,
} from "@/lib/sources/betfair";

export interface LiveFootballSelectionDto {
  id: number;
  name: string;
  role: string | null;
  exchangePrice: number | null;
  exchangeLayPrice: number | null;
  backSize: number | null;
  laySize: number | null;
  matchedVolume: number | null;
  qualifies: boolean;
  disqualifyReason: string | null;
}

export interface LiveFootballFixtureDto {
  id: string;
  kickoffTime: string;
  competition: string | null;
  country: string | null;
  homeTeam: string;
  awayTeam: string;
  status: string;
  qualifying: boolean;
  edgePickSelection: string | null;
  selectionCount: number;
  hasExchangeOdds: boolean;
  betfairMarketId: string | null;
  betfairMarketUrl: string | null;
  marketTotalMatched: number | null;
  oddsFetchedAt: string | null;
  selections: LiveFootballSelectionDto[];
}

function fixtureDateForKickoff(kickoff: Date): Date {
  return new Date(`${ukCalendarDate(kickoff)}T12:00:00.000Z`);
}

function kickoffWindowForDate(date: Date): { from: Date; to: Date } {
  return ukDayBoundsUtc(date);
}

function inferRole(name: string, homeTeam: string, awayTeam: string): string | null {
  const n = name.toLowerCase();
  if (n === "draw" || n === "the draw") return "draw";
  if (normalizeTeamName(name) === normalizeTeamName(homeTeam)) return "home";
  if (normalizeTeamName(name) === normalizeTeamName(awayTeam)) return "away";
  return null;
}

function mapFixtureToDto(
  fixture: {
    id: string;
    kickoffTime: Date;
    competition: string | null;
    country: string | null;
    homeTeam: string;
    awayTeam: string;
    status: string;
    qualifying: boolean;
    edgePickSelection: string | null;
    betfairMarketId: string | null;
    marketTotalMatched: { toString(): string } | null;
    selections: Array<{
      id: number;
      name: string;
      role: string | null;
      qualifies: boolean;
      disqualifyReason: string | null;
    }>;
    liveOdds: Array<{
      selectionName: string | null;
      betfairPrice: { toString(): string } | null;
      layPrice: { toString(): string } | null;
      backSize: { toString(): string } | null;
      laySize: { toString(): string } | null;
      matchedVolume: { toString(): string } | null;
      fetchedAt: Date;
    }>;
  }
): LiveFootballFixtureDto {
  const oddsByName = new Map<string, (typeof fixture.liveOdds)[number]>();
  for (const odds of fixture.liveOdds) {
    if (odds.selectionName) {
      const key = normalizeTeamName(odds.selectionName);
      if (!oddsByName.has(key)) oddsByName.set(key, odds);
    }
  }

  const latestFetch = fixture.liveOdds[0]?.fetchedAt ?? null;
  const selections: LiveFootballSelectionDto[] = fixture.selections.map((sel) => {
    const odds = oddsByName.get(normalizeTeamName(sel.name));
    return {
      id: sel.id,
      name: sel.name,
      role: sel.role,
      exchangePrice: odds?.betfairPrice ? Number(odds.betfairPrice) : null,
      exchangeLayPrice: odds?.layPrice ? Number(odds.layPrice) : null,
      backSize: odds?.backSize ? Number(odds.backSize) : null,
      laySize: odds?.laySize ? Number(odds.laySize) : null,
      matchedVolume: odds?.matchedVolume ? Number(odds.matchedVolume) : null,
      qualifies: sel.qualifies,
      disqualifyReason: sel.disqualifyReason,
    };
  });

  return {
    id: fixture.id,
    kickoffTime: fixture.kickoffTime.toISOString(),
    competition: fixture.competition,
    country: fixture.country,
    homeTeam: fixture.homeTeam,
    awayTeam: fixture.awayTeam,
    status: fixture.status,
    qualifying: fixture.qualifying,
    edgePickSelection: fixture.edgePickSelection,
    selectionCount: fixture.selections.length,
    hasExchangeOdds: fixture.liveOdds.some((o) => o.betfairPrice !== null),
    betfairMarketId: fixture.betfairMarketId,
    betfairMarketUrl: fixture.betfairMarketId
      ? betfairFootballMarketUrl(fixture.betfairMarketId)
      : null,
    marketTotalMatched: fixture.marketTotalMatched
      ? Number(fixture.marketTotalMatched)
      : null,
    oddsFetchedAt: latestFetch?.toISOString() ?? null,
    selections,
  };
}

async function fixtureInclude() {
  return {
    selections: { orderBy: { sortOrder: "asc" as const } },
    liveOdds: { orderBy: { fetchedAt: "desc" as const } },
  };
}

export async function listTodayFootballFixtures(date = new Date()): Promise<LiveFootballFixtureDto[]> {
  const { from, to } = kickoffWindowForDate(date);

  const fixtures = await db().footballFixture.findMany({
    where: { kickoffTime: { gte: from, lte: to } },
    include: await fixtureInclude(),
    orderBy: { kickoffTime: "asc" },
  });

  return fixtures.map(mapFixtureToDto);
}

async function upsertFootballMarket(market: BetfairFootballMarket) {
  const kickoff = new Date(market.kickoffTime);
  const fixtureDate = fixtureDateForKickoff(kickoff);

  return db().footballFixture.upsert({
    where: { id: market.marketId },
    create: {
      id: market.marketId,
      fixtureDate,
      kickoffTime: kickoff,
      competition: market.competition,
      country: market.country,
      homeTeam: market.homeTeam,
      awayTeam: market.awayTeam,
      betfairMarketId: market.marketId,
      status: "scheduled",
      scrapedAt: new Date(),
    },
    update: {
      fixtureDate,
      kickoffTime: kickoff,
      competition: market.competition,
      country: market.country,
      homeTeam: market.homeTeam,
      awayTeam: market.awayTeam,
      betfairMarketId: market.marketId,
      scrapedAt: new Date(),
    },
  });
}

export async function syncTodayFootballFixtures(date = new Date()) {
  if (getBetfairSetupError()) {
    throw new Error("Betfair Exchange credentials missing — required for today's football fixtures");
  }

  const markets = await listTodayFootballMarkets(date);

  for (const market of markets) {
    await upsertFootballMarket(market);
  }

  const fixtures = await listTodayFootballFixtures(date);
  return {
    date: ukCalendarDate(date),
    imported: markets.length,
    fixtures,
  };
}

/** Pull from Betfair when local DB has no fixtures for this UK day. */
export async function ensureTodayFootballFixturesSynced(date = new Date()): Promise<boolean> {
  const existing = await listTodayFootballFixtures(date);
  if (existing.length > 0) return false;
  await syncTodayFootballFixtures(date);
  return true;
}

export async function importFootballMarketFromBetfair(marketIdOrUrl: string) {
  if (getBetfairSetupError()) {
    throw new Error("Betfair Exchange credentials missing — required to import football markets");
  }

  const marketId = parseBetfairFootballMarketId(marketIdOrUrl);
  if (!marketId) {
    throw new Error("Could not parse Betfair market id from URL or input");
  }

  const market = await getFootballMarketById(marketId);
  if (!market) {
    throw new Error(`Betfair market ${marketId} not found`);
  }

  await upsertFootballMarket(market);
  const fixture = await db().footballFixture.findUnique({
    where: { id: market.marketId },
    include: await fixtureInclude(),
  });
  if (!fixture) throw new Error("Fixture missing after import");

  return mapFixtureToDto(fixture);
}

export async function refreshFootballFixture(fixtureId: string) {
  const existing = await db().footballFixture.findUnique({
    where: { id: fixtureId },
    include: await fixtureInclude(),
  });
  if (!existing) throw new Error("Fixture not found");

  const marketId = existing.betfairMarketId ?? fixtureId;
  const exchange = await getFootballExchangeOdds(marketId);

  await db().footballSelection.deleteMany({ where: { fixtureId } });
  await db().footballLiveOdds.deleteMany({ where: { fixtureId } });

  const now = new Date();
  const selectionRows = Array.from(exchange.prices.values()).map((price, index) => ({
    fixtureId,
    betfairSelectionId: price.selectionId,
    name: price.horseName,
    role: inferRole(price.horseName, existing.homeTeam, existing.awayTeam),
    sortOrder: index,
    qualifies: false,
    disqualifyReason: null,
  }));

  if (selectionRows.length > 0) {
    await db().footballSelection.createMany({ data: selectionRows });
  }

  const oddsRows = Array.from(exchange.prices.values()).map((price) => ({
    fixtureId,
    selectionName: price.horseName,
    betfairPrice: price.bestBackPrice,
    layPrice: price.bestLayPrice,
    backSize: price.bestBackSize,
    laySize: price.bestLaySize,
    matchedVolume: price.totalMatched,
    fetchedAt: now,
  }));

  if (oddsRows.length > 0) {
    await db().footballLiveOdds.createMany({ data: oddsRows });
  }

  await db().footballFixture.update({
    where: { id: fixtureId },
    data: {
      marketTotalMatched: exchange.marketTotalMatched,
      status: "card_loaded",
      scrapedAt: now,
    },
  });

  const updated = await db().footballFixture.findUnique({
    where: { id: fixtureId },
    include: await fixtureInclude(),
  });

  if (!updated) throw new Error("Fixture disappeared after refresh");
  return mapFixtureToDto(updated);
}

export async function syncFootballExchangeOdds(fixtureId: string) {
  const existing = await db().footballFixture.findUnique({
    where: { id: fixtureId },
    include: await fixtureInclude(),
  });
  if (!existing) throw new Error("Fixture not found");

  const marketId = existing.betfairMarketId ?? fixtureId;
  const exchange = await getFootballExchangeOdds(marketId);
  const now = new Date();

  await db().footballLiveOdds.deleteMany({ where: { fixtureId } });

  const oddsRows = Array.from(exchange.prices.values()).map((price) => ({
    fixtureId,
    selectionName: price.horseName,
    betfairPrice: price.bestBackPrice,
    layPrice: price.bestLayPrice,
    backSize: price.bestBackSize,
    laySize: price.bestLaySize,
    matchedVolume: price.totalMatched,
    fetchedAt: now,
  }));

  if (oddsRows.length > 0) {
    await db().footballLiveOdds.createMany({ data: oddsRows });
  }

  await db().footballFixture.update({
    where: { id: fixtureId },
    data: {
      marketTotalMatched: exchange.marketTotalMatched,
      status: existing.status === "scheduled" ? "live_odds" : existing.status,
    },
  });

  const updated = await db().footballFixture.findUnique({
    where: { id: fixtureId },
    include: await fixtureInclude(),
  });

  if (!updated) throw new Error("Fixture disappeared after exchange sync");

  return {
    fixture: mapFixtureToDto(updated),
    exchangeMeta: {
      marketId: exchange.marketId,
      marketName: exchange.marketName,
      marketTotalMatched: exchange.marketTotalMatched,
    },
  };
}

export interface FootballPickDto {
  fixtureId: string;
  kickoffTime: string;
  competition: string | null;
  homeTeam: string;
  awayTeam: string;
  selectionName: string | null;
  edgePrice: number | null;
  qualifies: boolean;
  failedRuleLabel: string;
}

export async function scanTodayFootballPicks(date = new Date()) {
  await ensureTodayFootballFixturesSynced(date);

  const rules = await getFootballRules();
  const fixtures = await listTodayFootballFixtures(date);
  const picks: FootballPickDto[] = [];
  let qualifying = 0;

  for (const fixture of fixtures) {
    let working = fixture;
    if (working.selections.length === 0) {
      try {
        working = await refreshFootballFixture(fixture.id);
      } catch {
        picks.push({
          fixtureId: fixture.id,
          kickoffTime: fixture.kickoffTime,
          competition: fixture.competition,
          homeTeam: fixture.homeTeam,
          awayTeam: fixture.awayTeam,
          selectionName: null,
          edgePrice: null,
          qualifies: false,
          failedRuleLabel: "Market not loaded",
        });
        continue;
      }
    }

    const homeSel = working.selections.find((s) => s.role === "home");
    const price = homeSel?.exchangePrice ?? null;
    const qualifies =
      price !== null &&
      price > 1.01 &&
      price <= rules.homeMaxPrice &&
      (homeSel?.matchedVolume ?? 0) >= rules.minMatchedVolume;

    await db().footballFixture.update({
      where: { id: working.id },
      data: {
        qualifying: qualifies,
        edgePickSelection: qualifies ? homeSel?.name ?? working.homeTeam : null,
      },
    });

    if (homeSel) {
      await db().footballSelection.update({
        where: { id: homeSel.id },
        data: {
          qualifies,
          disqualifyReason: qualifies ? null : `Home price above ${rules.homeMaxPrice}`,
        },
      });
    }

    if (qualifies && homeSel) {
      qualifying += 1;
      const existing = await db().footballQualifyingBet.findFirst({
        where: { fixtureId: working.id, selectionName: homeSel.name },
      });
      const betData = {
        kickoffTime: new Date(working.kickoffTime),
        competition: working.competition,
        homeTeam: working.homeTeam,
        awayTeam: working.awayTeam,
        edgePrice: price,
        stake: rules.stake,
        status: "pending" as const,
      };
      if (existing) {
        await db().footballQualifyingBet.update({ where: { id: existing.id }, data: betData });
      } else {
        await db().footballQualifyingBet.create({
          data: { fixtureId: working.id, selectionName: homeSel.name, ...betData },
        });
      }
    }

    picks.push({
      fixtureId: working.id,
      kickoffTime: working.kickoffTime,
      competition: working.competition,
      homeTeam: working.homeTeam,
      awayTeam: working.awayTeam,
      selectionName: homeSel?.name ?? working.homeTeam,
      edgePrice: price,
      qualifies,
      failedRuleLabel: qualifies
        ? "Strong home edge"
        : price === null
          ? "No exchange price"
          : `Home price above ${rules.homeMaxPrice}`,
    });
  }

  return { scanned: fixtures.length, qualifying, picks };
}

export async function listTodayFootballPicks(date = new Date()): Promise<FootballPickDto[]> {
  const { from, to } = kickoffWindowForDate(date);

  const fixtures = await db().footballFixture.findMany({
    where: { kickoffTime: { gte: from, lte: to } },
    include: { selections: { orderBy: { sortOrder: "asc" } } },
    orderBy: { kickoffTime: "asc" },
  });

  return fixtures.map((fixture) => {
    const homeSel =
      fixture.selections.find((s) => s.role === "home") ??
      fixture.selections.find((s) => normalizeTeamName(s.name) === normalizeTeamName(fixture.homeTeam));
    const qualifies = fixture.qualifying;
    return {
      fixtureId: fixture.id,
      kickoffTime: fixture.kickoffTime.toISOString(),
      competition: fixture.competition,
      homeTeam: fixture.homeTeam,
      awayTeam: fixture.awayTeam,
      selectionName: fixture.edgePickSelection ?? homeSel?.name ?? fixture.homeTeam,
      edgePrice: null,
      qualifies,
      failedRuleLabel: qualifies ? "Strong home edge" : homeSel?.disqualifyReason ?? "Not scanned",
    };
  });
}

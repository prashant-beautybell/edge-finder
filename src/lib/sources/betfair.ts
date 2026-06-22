/**
 * Betfair Exchange API (API-NG) client.
 * Supports interactive login (username/password) and certificate login.
 * Docs: https://developer.betfair.com/
 */

import fs from "node:fs";
import https from "node:https";
import { getBetfairConfig } from "@/lib/betfair-config";

const BETTING_API = "https://api.betfair.com/exchange/betting/json-rpc/v1";
const LOGIN_URL = "https://identitysso.betfair.com/api/login";
const CERT_LOGIN_HOST = "identitysso-cert.betfair.com";
const HORSE_RACING_EVENT_TYPE_ID = "7";

export interface BetfairRunnerPrice {
  selectionId: number;
  horseName: string;
  bestBackPrice: number | null;
  bestBackSize: number | null;
  bestLayPrice: number | null;
  bestLaySize: number | null;
  totalMatched: number | null;
}

/** Extract market id from Betfair Exchange URLs like .../market/1.259190153 */
export function parseBetfairMarketId(input: string): string | null {
  const trimmed = input.trim();
  const fromUrl = trimmed.match(/\/market\/(1\.\d+)/i)?.[1];
  if (fromUrl) return fromUrl;
  if (/^1\.\d+$/.test(trimmed)) return trimmed;
  return null;
}

export function betfairMarketUrl(marketId: string): string {
  return `https://www.betfair.com/exchange/plus/horse-racing/market/${marketId}`;
}

function normalizeCourse(name: string): string {
  return name
    .replace(/\s*\(IRE\)\s*/gi, "")
    .replace(/\s*\(GB\)\s*/gi, "")
    .replace(/^royal\s+/i, "")
    .replace(/\s+racecourse$/i, "")
    .replace(/\s+park$/i, "")
    .trim()
    .toLowerCase();
}

const COURSE_ALIASES: Record<string, string[]> = {
  ascot: ["royal ascot", "ascot"],
  epsom: ["epsom downs", "epsom"],
  newmarket: ["newmarket", "newmarket july"],
  york: ["york", "york racecourse"],
};

function coursesMatch(targetCourse: string, venue: string): boolean {
  if (!targetCourse || !venue) return false;
  if (venue === targetCourse || venue.includes(targetCourse) || targetCourse.includes(venue)) {
    return true;
  }

  for (const aliases of Object.values(COURSE_ALIASES)) {
    if (aliases.includes(targetCourse) && aliases.includes(venue)) {
      return true;
    }
    if (aliases.includes(targetCourse) && aliases.some((a) => venue.includes(a))) {
      return true;
    }
    if (aliases.includes(venue) && aliases.some((a) => targetCourse.includes(a))) {
      return true;
    }
  }

  return false;
}

export interface BetfairMarketMatch {
  marketId: string;
  marketName: string;
  marketStartTime: string;
  venue: string;
  runners: Array<{ selectionId: number; horseName: string }>;
}

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export function normalizeHorseName(name: string): string {
  return name
    .replace(/\s*\([^)]*\)\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

async function interactiveLogin(): Promise<string> {
  const config = getBetfairConfig();
  if (!config) throw new Error("Betfair not configured");

  const body = new URLSearchParams({
    username: config.username,
    password: config.password,
  });

  const res = await fetch(LOGIN_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "X-Application": config.appKey,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const raw = await res.text();
  let data: { token?: string; status?: string; error?: string };
  try {
    data = JSON.parse(raw) as typeof data;
  } catch {
    throw new Error(
      "Betfair login returned HTML instead of JSON — cloud servers are often blocked. " +
        "Add BETFAIR_APP_KEY, BETFAIR_USERNAME, and BETFAIR_PASSWORD to Vercel, or use certificate login."
    );
  }
  if (!res.ok || data.status !== "SUCCESS" || !data.token) {
    throw new Error(data.error || `Betfair login failed (${data.status ?? res.status})`);
  }
  return data.token;
}

function certificateLogin(): Promise<string> {
  const config = getBetfairConfig();
  if (!config?.certPath || !config?.keyPath) {
    return interactiveLogin();
  }

  return new Promise((resolve, reject) => {
    const body = new URLSearchParams({
      username: config.username,
      password: config.password,
    }).toString();

    const req = https.request(
      {
        hostname: CERT_LOGIN_HOST,
        path: "/api/certlogin",
        method: "POST",
        key: fs.readFileSync(config.keyPath!),
        cert: fs.readFileSync(config.certPath!),
        headers: {
          Accept: "application/json",
          "X-Application": config.appKey,
          "Content-Type": "application/x-www-form-urlencoded",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = "";
        res.on("data", (chunk) => {
          raw += chunk;
        });
        res.on("end", () => {
          try {
            const data = JSON.parse(raw) as {
              sessionToken?: string;
              token?: string;
              loginStatus?: string;
              status?: string;
              error?: string;
            };
            const token = data.sessionToken ?? data.token;
            const ok =
              data.loginStatus === "SUCCESS" ||
              data.status === "SUCCESS" ||
              Boolean(token);
            if (ok && token) {
              resolve(token);
            } else {
              reject(new Error(data.error || "Betfair certificate login failed"));
            }
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function ensureSession(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const config = getBetfairConfig();
  if (!config) {
    throw new Error("Betfair Exchange credentials missing from .env");
  }

  const token =
    config.certPath && config.keyPath
      ? await certificateLogin()
      : await interactiveLogin();

  cachedToken = token;
  tokenExpiresAt = Date.now() + 60 * 60 * 1000;
  return token;
}

async function jsonRpc<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const config = getBetfairConfig();
  if (!config) throw new Error("Betfair not configured");

  const token = await ensureSession();
  const payload = {
    jsonrpc: "2.0",
    method: `SportsAPING/v1.0/${method}`,
    params,
    id: 1,
  };

  const res = await fetch(BETTING_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Application": config.appKey,
      "X-Authentication": token,
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as {
    result?: T;
    error?: { message?: string; data?: { APINGException?: { errorCode?: string } } };
  };

  if (data.error) {
    const code = data.error.data?.APINGException?.errorCode;
    if (code === "INVALID_SESSION_INFORMATION") {
      cachedToken = null;
      tokenExpiresAt = 0;
    }
    throw new Error(data.error.message ?? "Betfair API error");
  }

  if (!data.result) {
    throw new Error("Betfair API returned empty result");
  }

  return data.result;
}

function isoWindow(raceTime: Date, minutes = 10): { from: string; to: string } {
  const from = new Date(raceTime.getTime() - minutes * 60 * 1000);
  const to = new Date(raceTime.getTime() + minutes * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
}

export async function findWinMarket(
  course: string,
  raceTime: Date,
  raceName?: string | null,
  runnerCount?: number | null
): Promise<BetfairMarketMatch | null> {
  const { from, to } = isoWindow(raceTime, 20);

  const markets = await jsonRpc<
    Array<{
      marketId: string;
      marketName: string;
      marketStartTime: string;
      event?: { venue?: string; name?: string; countryCode?: string };
      runners?: Array<{ selectionId: number; runnerName: string }>;
    }>
  >("listMarketCatalogue", {
    filter: {
      eventTypeIds: [HORSE_RACING_EVENT_TYPE_ID],
      marketCountries: ["GB", "IE"],
      marketTypeCodes: ["WIN"],
      marketStartTime: { from, to },
    },
    sort: "FIRST_TO_START",
    maxResults: 100,
    marketProjection: ["EVENT", "RUNNER_DESCRIPTION", "MARKET_START_TIME"],
  });

  if (!markets.length) return null;

  const targetCourse = normalizeCourse(course);
  const targetTime = raceTime.getTime();

  let best: (typeof markets)[number] | null = null;
  let bestScore = -Infinity;

  for (const market of markets) {
    const venue = normalizeCourse(market.event?.venue ?? "");
    const timeDiff = Math.abs(new Date(market.marketStartTime).getTime() - targetTime);
    const courseMatch = coursesMatch(targetCourse, venue);
    if (!courseMatch || timeDiff > 20 * 60 * 1000) continue;

    let score = 1000 - timeDiff / 1000;
    if (raceName && market.marketName) {
      const rn = raceName.toLowerCase();
      const mn = market.marketName.toLowerCase();
      if (rn.includes(mn) || mn.includes(rn.slice(0, 20))) score += 50;
    }
    if (runnerCount && market.runners?.length) {
      const runnerDiff = Math.abs(market.runners.length - runnerCount);
      score += Math.max(0, 30 - runnerDiff * 10);
    }

    if (score > bestScore) {
      bestScore = score;
      best = market;
    }
  }

  if (!best) return null;

  return {
    marketId: best.marketId,
    marketName: best.marketName,
    marketStartTime: best.marketStartTime,
    venue: best.event?.venue ?? course,
    runners: (best.runners ?? []).map((r) => ({
      selectionId: r.selectionId,
      horseName: r.runnerName,
    })),
  };
}

export async function getMarketPrices(marketId: string): Promise<BetfairRunnerPrice[]> {
  const books = await jsonRpc<
    Array<{
      marketId: string;
      totalMatched?: number;
      runners: Array<{
        selectionId: number;
        ex?: {
          availableToBack?: Array<{ price: number; size: number }>;
          availableToLay?: Array<{ price: number; size: number }>;
        };
        totalMatched?: number;
      }>;
    }>
  >("listMarketBook", {
    marketIds: [marketId],
    priceProjection: { priceData: ["EX_BEST_OFFERS"] },
  });

  const book = books[0];
  if (!book) return [];

  return book.runners.map((runner) => ({
    selectionId: runner.selectionId,
    horseName: "",
    bestBackPrice: runner.ex?.availableToBack?.[0]?.price ?? null,
    bestBackSize: runner.ex?.availableToBack?.[0]?.size ?? null,
    bestLayPrice: runner.ex?.availableToLay?.[0]?.price ?? null,
    bestLaySize: runner.ex?.availableToLay?.[0]?.size ?? null,
    totalMatched: runner.totalMatched ?? null,
  }));
}

export async function getExchangeOddsByMarketId(marketId: string): Promise<{
  marketId: string;
  marketName: string;
  venue: string | null;
  marketStartTime: string | null;
  marketTotalMatched: number | null;
  prices: Map<string, BetfairRunnerPrice & { horseName: string }>;
}> {
  const rows = await jsonRpc<
    Array<{
      marketId: string;
      marketName: string;
      marketStartTime?: string;
      totalMatched?: number;
      event?: { venue?: string };
      runners?: Array<{ selectionId: number; runnerName: string }>;
    }>
  >("listMarketCatalogue", {
    filter: { marketIds: [marketId] },
    maxResults: 1,
    marketProjection: ["RUNNER_DESCRIPTION", "EVENT", "MARKET_START_TIME"],
  });

  const catalogue = rows[0];
  if (!catalogue) {
    throw new Error(`Betfair market ${marketId} not found or not open`);
  }

  const catalogueRunners = (catalogue.runners ?? []).map((r) => ({
    selectionId: r.selectionId,
    horseName: r.runnerName,
  }));

  const books = await jsonRpc<
    Array<{
      marketId: string;
      totalMatched?: number;
      runners: Array<{
        selectionId: number;
        ex?: {
          availableToBack?: Array<{ price: number; size: number }>;
          availableToLay?: Array<{ price: number; size: number }>;
        };
        totalMatched?: number;
      }>;
    }>
  >("listMarketBook", {
    marketIds: [marketId],
    priceProjection: { priceData: ["EX_BEST_OFFERS"] },
  });

  const book = books[0];
  const selectionToName = new Map(
    catalogueRunners.map((r) => [r.selectionId, r.horseName])
  );

  const prices = new Map<string, BetfairRunnerPrice & { horseName: string }>();
  for (const runner of book?.runners ?? []) {
    const horseName = selectionToName.get(runner.selectionId) ?? "";
    if (!horseName) continue;
    const entry: BetfairRunnerPrice & { horseName: string } = {
      selectionId: runner.selectionId,
      horseName,
      bestBackPrice: runner.ex?.availableToBack?.[0]?.price ?? null,
      bestBackSize: runner.ex?.availableToBack?.[0]?.size ?? null,
      bestLayPrice: runner.ex?.availableToLay?.[0]?.price ?? null,
      bestLaySize: runner.ex?.availableToLay?.[0]?.size ?? null,
      totalMatched: runner.totalMatched ?? null,
    };
    prices.set(normalizeHorseName(horseName), entry);
  }

  return {
    marketId,
    marketName: catalogue.marketName,
    venue: catalogue.event?.venue ?? null,
    marketStartTime: catalogue.marketStartTime ?? null,
    marketTotalMatched: book?.totalMatched ?? catalogue.totalMatched ?? null,
    prices,
  };
}

export async function getExchangeOddsForRace(
  course: string,
  raceTime: Date,
  raceName: string | null | undefined,
  horseNames: string[],
  knownMarketId?: string | null
): Promise<{
  marketId: string;
  marketName: string;
  prices: Map<string, BetfairRunnerPrice & { horseName: string }>;
  marketTotalMatched: number | null;
}> {
  let marketId = knownMarketId ?? null;
  let catalogueRunners: Array<{ selectionId: number; horseName: string }> = [];
  let catalogueMarketName = raceName ?? "";

  if (!marketId) {
    const found = await findWinMarket(course, raceTime, raceName, horseNames.length);
    if (!found) {
      throw new Error(
        `No Betfair WIN market found for ${course} at ${raceTime.toISOString()}. ` +
          "The market may not be open on the Exchange yet."
      );
    }
    marketId = found.marketId;
    catalogueRunners = found.runners;
    catalogueMarketName = found.marketName;
  } else {
    const rows = await jsonRpc<
      Array<{
        marketId: string;
        marketName: string;
        runners?: Array<{ selectionId: number; runnerName: string }>;
      }>
    >("listMarketCatalogue", {
      filter: { marketIds: [marketId] },
      maxResults: 1,
      marketProjection: ["RUNNER_DESCRIPTION", "EVENT"],
    });
    catalogueMarketName = rows[0]?.marketName ?? catalogueMarketName;
    catalogueRunners = (rows[0]?.runners ?? []).map((r) => ({
      selectionId: r.selectionId,
      horseName: r.runnerName,
    }));
  }

  const rawPrices = await getMarketPrices(marketId);
  const bookData = await jsonRpc<Array<{ totalMatched?: number }>>("listMarketBook", {
    marketIds: [marketId],
    priceProjection: { priceData: ["EX_BEST_OFFERS"] },
  });

  const selectionToName = new Map<number, string>();
  for (const runner of catalogueRunners) {
    selectionToName.set(runner.selectionId, runner.horseName);
  }

  const prices = new Map<string, BetfairRunnerPrice & { horseName: string }>();
  for (const price of rawPrices) {
    const horseName = selectionToName.get(price.selectionId) ?? "";
    if (!horseName) continue;
    prices.set(normalizeHorseName(horseName), { ...price, horseName });
  }

  return {
    marketId,
    marketName: catalogueMarketName,
    prices,
    marketTotalMatched: bookData[0]?.totalMatched ?? null,
  };
}

export async function testBetfairConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await ensureSession();
    const markets = await jsonRpc<unknown[]>("listMarketCatalogue", {
      filter: {
        eventTypeIds: [HORSE_RACING_EVENT_TYPE_ID],
        marketCountries: ["GB"],
        marketTypeCodes: ["WIN"],
      },
      maxResults: 1,
      marketProjection: ["EVENT"],
    });
    return {
      ok: true,
      message: `Connected — ${markets.length} market(s) visible`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

// ---------------------------------------------------------------------------
// Football / Soccer (event type 1, Match Odds)
// ---------------------------------------------------------------------------

export const FOOTBALL_EVENT_TYPE_ID = "1";

export function betfairFootballMarketUrl(marketId: string): string {
  return `https://www.betfair.com/exchange/plus/football/market/${marketId}`;
}

export function normalizeTeamName(name: string): string {
  return normalizeHorseName(name);
}

export interface BetfairFootballMarket {
  marketId: string;
  marketName: string;
  kickoffTime: string;
  competition: string | null;
  country: string | null;
  homeTeam: string;
  awayTeam: string;
  runners: Array<{ selectionId: number; name: string; sortOrder: number }>;
}

function parseTeamsFromEvent(eventName: string, runners: string[]): { home: string; away: string } {
  const split = eventName.split(/\s+v\s+|\s+vs\s+/i);
  if (split.length >= 2) {
    return { home: split[0].trim(), away: split[1].trim() };
  }
  if (runners.length >= 2) {
    const teams = runners.filter((r) => !/^draw$/i.test(r));
    if (teams.length >= 2) return { home: teams[0], away: teams[1] };
  }
  return { home: eventName || "Home", away: "Away" };
}

export function ukCalendarDate(isoOrDate: string | Date): string {
  const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
  return d.toLocaleDateString("en-CA", { timeZone: "Europe/London" });
}

/** UK calendar day start/end as UTC instants (Europe/London midnight boundaries). */
export function ukDayBoundsUtc(ref = new Date()): { from: Date; to: Date } {
  const ukDate = ukCalendarDate(ref);
  const [y, m, d] = ukDate.split("-").map(Number);
  const probe = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const londonHour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "numeric",
      hour12: false,
    }).format(probe)
  );
  const offsetHours = londonHour - probe.getUTCHours();

  return {
    from: new Date(Date.UTC(y, m - 1, d, -offsetHours, 0, 0)),
    to: new Date(Date.UTC(y, m - 1, d, 23 - offsetHours, 59, 59, 999)),
  };
}

function footballDayWindow(date = new Date()): { from: string; to: string } {
  const { from, to } = ukDayBoundsUtc(date);
  return { from: from.toISOString(), to: to.toISOString() };
}

/** Extract Betfair market id from a URL slug (`…-betting-35734265`) or raw id. */
export function parseBetfairFootballMarketId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  const slugMatch = trimmed.match(/-betting-(\d+)\s*$/i);
  if (slugMatch) return slugMatch[1];
  const pathMatch = trimmed.match(/\/market\/(\d+)/i);
  if (pathMatch) return pathMatch[1];
  if (/^\d+$/.test(trimmed)) return trimmed;
  return null;
}

function mapCatalogueToFootballMarket(market: {
  marketId: string;
  marketName: string;
  marketStartTime: string;
  event?: { name?: string; countryCode?: string };
  competition?: { name?: string };
  runners?: Array<{ selectionId: number; runnerName: string; sortPriority?: number }>;
}): BetfairFootballMarket {
  const runnerNames = (market.runners ?? []).map((r) => r.runnerName);
  const eventName = market.event?.name ?? market.marketName;
  const { home, away } = parseTeamsFromEvent(eventName, runnerNames);

  return {
    marketId: market.marketId,
    marketName: market.marketName,
    kickoffTime: market.marketStartTime,
    competition: market.competition?.name ?? null,
    country: market.event?.countryCode ?? null,
    homeTeam: home,
    awayTeam: away,
    runners: (market.runners ?? []).map((r, i) => ({
      selectionId: r.selectionId,
      name: r.runnerName,
      sortOrder: r.sortPriority ?? i,
    })),
  };
}

type FootballCatalogueRow = {
  marketId: string;
  marketName: string;
  marketStartTime: string;
  event?: { name?: string; countryCode?: string };
  competition?: { name?: string };
  runners?: Array<{ selectionId: number; runnerName: string; sortPriority?: number }>;
};

export async function getFootballMarketById(marketId: string): Promise<BetfairFootballMarket | null> {
  const rows = await jsonRpc<FootballCatalogueRow[]>("listMarketCatalogue", {
    filter: { marketIds: [marketId] },
    maxResults: 1,
    marketProjection: ["EVENT", "COMPETITION", "RUNNER_DESCRIPTION", "MARKET_START_TIME"],
  });
  const market = rows[0];
  if (!market) return null;
  return mapCatalogueToFootballMarket(market);
}

async function listFootballMarketsInWindow(
  fromIso: string,
  toIso: string
): Promise<FootballCatalogueRow[]> {
  const all: FootballCatalogueRow[] = [];
  let cursor = fromIso;
  const maxPages = 20;

  for (let page = 0; page < maxPages; page++) {
    const batch = await jsonRpc<FootballCatalogueRow[]>("listMarketCatalogue", {
      filter: {
        eventTypeIds: [FOOTBALL_EVENT_TYPE_ID],
        marketTypeCodes: ["MATCH_ODDS"],
        marketStartTime: { from: cursor, to: toIso },
      },
      sort: "FIRST_TO_START",
      maxResults: 1000,
      marketProjection: ["EVENT", "COMPETITION", "RUNNER_DESCRIPTION", "MARKET_START_TIME"],
    });

    if (batch.length === 0) break;
    all.push(...batch);

    if (batch.length < 1000) break;

    const lastKickoff = batch[batch.length - 1]?.marketStartTime;
    if (!lastKickoff || lastKickoff >= toIso) break;
    cursor = new Date(new Date(lastKickoff).getTime() + 1000).toISOString();
  }

  const seen = new Set<string>();
  return all.filter((market) => {
    if (seen.has(market.marketId)) return false;
    seen.add(market.marketId);
    return true;
  });
}

export async function listTodayFootballMarkets(date = new Date()): Promise<BetfairFootballMarket[]> {
  const { from, to } = footballDayWindow(date);
  const markets = await listFootballMarketsInWindow(from, to);
  const ukDate = ukCalendarDate(date);

  return markets
    .filter((market) => ukCalendarDate(market.marketStartTime) === ukDate)
    .map(mapCatalogueToFootballMarket);
}

export async function testFootballBetfairConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    await ensureSession();
    const { from, to } = footballDayWindow();
    const markets = await listFootballMarketsInWindow(from, to);
    return {
      ok: true,
      message: `Connected — ${markets.length} football Match Odds market(s) today`,
    };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof Error ? error.message : "Connection failed",
    };
  }
}

export async function getFootballExchangeOdds(marketId: string): Promise<{
  marketId: string;
  marketName: string;
  kickoffTime: string | null;
  competition: string | null;
  marketTotalMatched: number | null;
  prices: Map<string, BetfairRunnerPrice & { horseName: string }>;
}> {
  const data = await getExchangeOddsByMarketId(marketId);
  return {
    marketId: data.marketId,
    marketName: data.marketName,
    kickoffTime: data.marketStartTime,
    competition: data.venue,
    marketTotalMatched: data.marketTotalMatched,
    prices: data.prices,
  };
}

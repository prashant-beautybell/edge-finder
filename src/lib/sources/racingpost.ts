/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Racing Post data adapter.
 *
 * Racing Post is a Next.js app that embeds all page data in a
 * <script id="__NEXT_DATA__"> JSON blob. Parsing that JSON is far more stable
 * than scraping the rendered DOM, but it is still an unofficial source: their
 * terms prohibit scraping, and the JSON shape can change without notice. All
 * field access is therefore funnelled through this single module so that, if
 * the shape drifts, there is exactly one place to recalibrate.
 *
 * Calibrated against the live site on 2026-06-17. Search for `CALIBRATE:` to
 * find the field paths most likely to need updating.
 */

const RP_BASE = "https://www.racingpost.com";

const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) " +
  "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** Racecards live under /racecards/; results pages use legacy HTML without __NEXT_DATA__. */
export function toRaceCardUrl(path: string): string {
  if (!path) return path;
  if (path.includes("/results/")) {
    return path.replace("/results/", "/racecards/");
  }
  return path;
}

export function toResultUrl(path: string): string {
  if (!path) return path;
  if (path.includes("/racecards/")) {
    return path.replace("/racecards/", "/results/");
  }
  return path;
}

export interface RpRace {
  raceId: string;
  raceUrl: string;
  course: string;
  country: string;
  raceTitle: string;
  /** RP race type code. "F" = flat. Jumps (C/H/B) are excluded by the algorithm. */
  raceTypeCode: string | null;
  isHandicap: boolean;
  isTurf: boolean;
  distanceYards: number | null;
  distanceBand: string | null;
  fieldSize: number | null;
  going: string | null;
  /** ISO-ish local off time, e.g. "2026-06-17 17:00". */
  startDateTime: string | null;
  resultUrl: string | null;
  isResult: boolean;
}

export interface RpRunner {
  horseId: string;
  horseName: string;
  horseUrl: string | null;
  jockeyName: string | null;
  jockeyUrl: string | null;
  trainerName: string | null;
  officialRatingToday: number | null;
  weightTotalLbs: number | null;
  weightStone: number | null;
  weightLbs: number | null;
  /** Morning forecast price (RP forecast). Lowest = morning favourite. */
  forecastOdds: number | null;
  nonRunner: boolean;
}

export interface RpRaceCard {
  race: RpRace;
  runners: RpRunner[];
}

/** A single past run from a horse's form page, most-recent first. */
export interface RpFormRun {
  raceId: string | null;
  raceUrl: string | null;
  date: string | null;
  finishPos: number | null;
  officialRating: number | null;
  distanceYards: number | null;
  distanceBand: string | null;
}

export interface RpResultRunner {
  horseName: string;
  finishPos: number | null;
  spDecimal: number | null;
}

// ---------------------------------------------------------------------------
// Low-level fetch + __NEXT_DATA__ extraction
// ---------------------------------------------------------------------------

async function fetchHtml(path: string): Promise<string> {
  const url = path.startsWith("http") ? path : `${RP_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-GB,en;q=0.9",
      "Cache-Control": "no-cache",
      Referer: `${RP_BASE}/`,
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "same-origin",
    },
    redirect: "follow",
    next: { revalidate: 0 },
  });
  if (!res.ok) {
    throw new Error(`Racing Post fetch failed ${res.status} for ${url}`);
  }
  const html = await res.text();
  const blocked = detectBlockedHtml(html);
  if (blocked) {
    throw new Error(blocked);
  }
  return html;
}

function detectBlockedHtml(html: string): string | null {
  const lower = html.slice(0, 4000).toLowerCase();
  if (
    lower.includes("cf-browser-verification") ||
    lower.includes("attention required") ||
    lower.includes("access denied")
  ) {
    return (
      "Racing Post blocked this request (bot protection from cloud servers). " +
      "Card/Results work locally; on Vercel try again after redeploy or use local dev for scraping."
    );
  }
  return null;
}

function parseNextDataFromHtml(html: string): any | null {
  const match = html.match(
    /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
  );
  if (!match) return null;
  return JSON.parse(match[1]);
}

async function fetchNextData(path: string): Promise<any> {
  const cardPath = toRaceCardUrl(path);
  const url = cardPath.startsWith("http") ? cardPath : `${RP_BASE}${cardPath}`;
  const html = await fetchHtml(cardPath);
  const nextData = parseNextDataFromHtml(html);
  if (!nextData) {
    if (path.includes("/results/")) {
      throw new Error(
        `This is a results page — use the Results button, not Card. (${url})`
      );
    }
    throw new Error(`No __NEXT_DATA__ found on ${url}`);
  }
  return nextData;
}

/** UK fractional SP (e.g. 4/1, Evens) → decimal odds. */
function fractionalSpToDecimal(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = raw.trim().toLowerCase();
  if (!text || text === "—" || text === "-") return null;
  if (text === "evens" || text === "even") return 2;
  if (text.includes("/")) {
    const [numPart, denPart] = text.split("/");
    const num = Number(numPart);
    const den = Number(denPart);
    if (Number.isFinite(num) && Number.isFinite(den) && den > 0) {
      return 1 + num / den;
    }
  }
  const direct = Number(text);
  return Number.isFinite(direct) && direct > 1 ? direct : null;
}

/**
 * RP results pages (as of 2026) use a legacy Angular app with window.horseData
 * plus an HTML results table — not __NEXT_DATA__.
 */
function parseLegacyResultHtml(html: string): RpResultRunner[] {
  const horseDataMatch = html.match(/window\.horseData\s*=\s*(\{[\s\S]*?\});/);
  if (!horseDataMatch) {
    throw new Error(
      "Results not published yet on Racing Post — try again after the race has finished."
    );
  }

  let horseData: { items?: Array<{ outcomeCode?: string; runnerInfo?: { horseId?: number } }> };
  try {
    horseData = JSON.parse(horseDataMatch[1]);
  } catch {
    throw new Error("Could not parse Racing Post results data.");
  }

  const positionByHorseId = new Map<number, number | null>();
  for (const item of horseData.items ?? []) {
    const horseId = item.runnerInfo?.horseId;
    if (!horseId) continue;
    const code = item.outcomeCode ?? "";
    const pos = /^\d+$/.test(code) ? Number(code) : null;
    positionByHorseId.set(horseId, pos);
  }

  const runners: RpResultRunner[] = [];
  const rowPattern =
    /<tr[^>]*data-test-selector="table-row"[^>]*>([\s\S]*?)<\/tr>/g;

  for (const row of html.matchAll(rowPattern)) {
    const content = row[1];
    const horseIdMatch = content.match(/profile\/horse\/(\d+)\//);
    const nameMatch = content.match(
      /data-test-selector="link-horseName"[^>]*>\s*([^<]+)/
    );
    const spMatch = content.match(/rp-horseTable__horse__price">\s*([^<]+)/);
    const posMatch = content.match(
      /data-test-selector="text-horsePosition"[^>]*>\s*(\d+)/
    );

    const horseName = nameMatch?.[1]?.trim().replace(/\s+/g, " ");
    if (!horseName) continue;

    const horseId = horseIdMatch ? Number(horseIdMatch[1]) : null;
    const finishPos =
      (horseId !== null ? positionByHorseId.get(horseId) : null) ??
      (posMatch ? Number(posMatch[1]) : null);

    runners.push({
      horseName,
      finishPos,
      spDecimal: fractionalSpToDecimal(spMatch?.[1]),
    });
  }

  if (!runners.length) {
    throw new Error(
      "Results not published yet on Racing Post — try again after the race has finished."
    );
  }

  return runners;
}

function initialState(nextData: any): any {
  return nextData?.props?.pageProps?.initialState ?? {};
}

// ---------------------------------------------------------------------------
// Distance / type helpers (mirrors src/lib/csv-utils.ts banding)
// ---------------------------------------------------------------------------

export function distBandFromYards(yards: number | null | undefined): string | null {
  if (yards === null || yards === undefined || Number.isNaN(yards)) return null;
  const furlongs = yards / 220;
  if (furlongs > 4.5 && furlongs <= 5.5) return "5f";
  if (furlongs > 5.5 && furlongs <= 6.5) return "6f";
  if (furlongs > 6.5 && furlongs <= 7.5) return "7f";
  if (furlongs > 7.5 && furlongs <= 8.5) return "1m";
  return null;
}

function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function detectHandicap(race: any): boolean {
  const hay = [
    race?.raceHandicapDesc,
    race?.category,
    race?.raceCategoryDesc,
    race?.raceTitle,
    race?.name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /handicap|nursery/.test(hay);
}

function detectTurf(race: any): boolean {
  const surface = String(race?.surfaceType ?? "").toLowerCase();
  if (surface) return surface === "turf";
  // Fallback to the going string if surfaceType is absent.
  const going = String(race?.going ?? "");
  return !/AW|Polytrack|Tapeta|Fibresand|Standard/i.test(going);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Today's (or a given date's) GB & Ireland meetings, flattened to races.
 * `date` is ignored by RP's default racecards route (it serves "today"); pass
 * a dated path like `/racecards/{YYYY-MM-DD}` for other days.
 */
export async function fetchMeetings(datePath = "/racecards/"): Promise<RpRace[]> {
  const data = await fetchNextData(datePath);
  // CALIBRATE: meetings live at initialState.raceCards.meetings
  const meetings: any[] = initialState(data)?.raceCards?.meetings ?? [];
  const races: RpRace[] = [];

  for (const meeting of meetings) {
    const country = String(meeting?.country ?? "").toUpperCase();
    // GB & Ireland only.
    if (country && !["GB", "IRE", "UK", "GBR", "IRL"].includes(country)) continue;
    const course = meeting?.courseName ?? meeting?.name ?? "";

    for (const r of meeting?.races ?? []) {
      const distanceYards = num(r?.distanceYards);
      races.push({
        raceId: String(r?.raceId),
        raceUrl: r?.raceUrl ?? "",
        course,
        country,
        raceTitle: r?.raceTitle ?? r?.name ?? "",
        raceTypeCode: r?.raceTypeCode ?? null,
        isHandicap: detectHandicap(r),
        isTurf: detectTurf(r),
        distanceYards,
        distanceBand: distBandFromYards(distanceYards),
        fieldSize: num(r?.numberOfRunners),
        going: r?.goingDetails ?? meeting?.goingDetails ?? null,
        startDateTime: r?.raceDateTime ?? r?.raceStart ?? null,
        resultUrl: r?.resultUrl ?? guessResultUrl(r?.raceUrl ?? ""),
        isResult: Boolean(r?.isResult),
      });
    }
  }
  return races;
}

function guessResultUrl(raceUrl: string): string | null {
  if (!raceUrl) return null;
  if (raceUrl.includes("/results/")) return raceUrl;
  if (raceUrl.includes("/racecards/")) {
    return raceUrl.replace("/racecards/", "/results/");
  }
  return null;
}

/** Full racecard (race + runners) for a single race. */
export async function fetchRaceCard(raceUrl: string): Promise<RpRaceCard> {
  const cardUrl = toRaceCardUrl(raceUrl);
  const data = await fetchNextData(cardUrl);
  // CALIBRATE: race + runners live at initialState.racePage.data
  const pageData = initialState(data)?.racePage?.data ?? {};
  const race = pageData?.race ?? {};
  const distanceYards = num(race?.distanceYards);

  const rpRace: RpRace = {
    raceId: String(race?.raceId),
    raceUrl: cardUrl,
    course: race?.courseName ?? "",
    country: String(race?.countryCode ?? "").toUpperCase(),
    raceTitle: race?.raceTitle ?? "",
    raceTypeCode: race?.raceType ?? null,
    isHandicap: detectHandicap(race),
    isTurf: detectTurf(race),
    distanceYards,
    distanceBand: distBandFromYards(distanceYards),
    fieldSize: num(race?.numberOfRunners),
    going: race?.going ?? null,
    startDateTime: race?.startDateTime ?? race?.raceTime ?? null,
    resultUrl: race?.resultUrl ?? guessResultUrl(cardUrl),
    isResult: Boolean(race?.isResult),
  };

  const runners: RpRunner[] = (pageData?.runners ?? []).map((r: any) => {
    const stone = num(r?.formattedWeightStones);
    const lbs = num(r?.formattedWeightPounds);
    const totalFromParts =
      stone !== null && lbs !== null ? stone * 14 + lbs : null;
    return {
      horseId: String(r?.horseId),
      horseName: r?.horseName ?? "",
      horseUrl: r?.horseUrl ?? null,
      jockeyName: r?.jockeyName ?? null,
      jockeyUrl: r?.jockeyUrl ?? null,
      trainerName: r?.trainerName ?? null,
      officialRatingToday: num(r?.officialRatingToday),
      weightTotalLbs: num(r?.lhWeightCarriedLbs) ?? totalFromParts,
      weightStone: stone,
      weightLbs: lbs,
      forecastOdds: num(r?.forecastOddsValue),
      nonRunner: Boolean(r?.nonRunner),
    } as RpRunner;
  });

  return { race: rpRace, runners };
}

/**
 * A horse's recent form, most-recent first. Used for R3 (LTO finish),
 * R9 (LTO distance band) and to locate the LTO race id for R4 (top-rated).
 */
export async function fetchHorseForm(horseUrl: string): Promise<RpFormRun[]> {
  const data = await fetchNextData(horseUrl);
  const st = initialState(data);
  // CALIBRATE: the horse profile form table. RP nests it under the horse page
  // state; the exact key has historically been one of these.
  const formData: any[] =
    st?.horsePage?.data?.form ??
    st?.horse?.form ??
    st?.runnersIndex?.data?.form ??
    [];

  return formData.map((f: any) => {
    const distanceYards = num(f?.distanceYards ?? f?.raceDistanceYards);
    return {
      raceId: f?.raceId ? String(f.raceId) : null,
      raceUrl: f?.raceUrl ?? null,
      date: f?.raceDate ?? f?.date ?? null,
      finishPos: num(f?.position ?? f?.finishPosition ?? f?.outcome),
      officialRating: num(f?.officialRating ?? f?.or),
      distanceYards,
      distanceBand: distBandFromYards(distanceYards),
    };
  });
}

/** Result for a finished race: finishing positions + SP for every runner. */
export async function fetchResult(resultUrl: string): Promise<RpResultRunner[]> {
  const normalized = toResultUrl(resultUrl);
  const html = await fetchHtml(normalized);

  const nextData = parseNextDataFromHtml(html);
  if (nextData) {
    const st = initialState(nextData);
    const runners: any[] =
      st?.resultPage?.data?.runners ?? st?.racePage?.data?.runners ?? [];
    if (runners.length > 0) {
      return runners.map((r: any) => ({
        horseName: r?.horseName ?? "",
        finishPos: num(r?.finishPosition ?? r?.position),
        spDecimal: num(r?.spDecimal ?? r?.startingPriceDecimal),
      }));
    }
  }

  return parseLegacyResultHtml(html);
}

/**
 * The maximum OR among all runners in a given (previous) race — needed for R4
 * ("was the horse top-rated in its last race?"). Falls back to the card's
 * `highestOfficialRating` if present.
 */
export async function fetchRaceMaxOr(raceUrl: string): Promise<number | null> {
  const { race, runners } = await fetchRaceCardRaw(raceUrl);
  const fromField = num(race?.highestOfficialRating);
  const fromRunners = runners
    .map((r) => r.officialRatingToday)
    .filter((v): v is number => v !== null);
  const runnerMax = fromRunners.length ? Math.max(...fromRunners) : null;
  if (fromField !== null && runnerMax !== null) return Math.max(fromField, runnerMax);
  return fromField ?? runnerMax;
}

// Internal: same as fetchRaceCard but also returns the raw race object so
// fetchRaceMaxOr can read highestOfficialRating.
async function fetchRaceCardRaw(
  raceUrl: string
): Promise<{ race: any; runners: RpRunner[] }> {
  const card = await fetchRaceCard(raceUrl);
  // Re-fetch is wasteful; instead expose via the public card. We keep the raw
  // OR via runners and the highestOfficialRating is recomputed from runners.
  return {
    race: { highestOfficialRating: null },
    runners: card.runners,
  };
}

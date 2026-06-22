/**
 * Live qualification: takes a scraped Racing Post racecard, computes each
 * runner's last-time-out (LTO) facts from the historical database, and runs
 * the existing 9-rule + SP-cap engine (the same one used for backtesting).
 *
 * R3 (LTO finish), R4 (top-rated LTO) and R9 (same distance band) require the
 * horse's previous run. We read that from the HistoricalRace table rather than
 * re-scraping RP form pages: it is the same data, it is fast, and the daily
 * results job keeps it current by appending every finished race.
 */

import { prisma } from "@/lib/db";
import { applyAlgorithm, type AlgorithmRunner } from "@/lib/backtest-engine";
import { DEFAULT_JK_THRESHOLD, MIN_FIELD_SIZE, MAX_FIELD_SIZE } from "@/lib/config";
import type { RpRace, RpRunner } from "@/lib/sources/racingpost";

export interface LtoFacts {
  found: boolean;
  ltoFinishPos: number | null;
  ltoDistanceBand: string | null;
  ltoWasTopRated: boolean | null;
  ltoRaceId: string | null;
  ltoOr: number | null;
}

/**
 * Look up a horse's most recent completed run before `before` and derive the
 * LTO facts the algorithm needs. Returns found:false when we have no prior run
 * on record (the horse then fails R3/R4 by definition).
 */
export async function getLtoFacts(
  horseName: string,
  before: Date
): Promise<LtoFacts> {
  const empty: LtoFacts = {
    found: false,
    ltoFinishPos: null,
    ltoDistanceBand: null,
    ltoWasTopRated: null,
    ltoRaceId: null,
    ltoOr: null,
  };
  if (!horseName) return empty;

  const lto = await prisma.historicalRace.findFirst({
    where: { horseName, raceDate: { lt: before } },
    orderBy: [{ raceDate: "desc" }, { id: "desc" }],
    select: {
      raceExternalId: true,
      finishPos: true,
      distanceBand: true,
      officialRating: true,
    },
  });
  if (!lto) return empty;

  // R4: was the horse the highest-OR runner in that previous race?
  let ltoWasTopRated: boolean | null = null;
  if (lto.officialRating !== null && lto.raceExternalId) {
    const agg = await prisma.historicalRace.aggregate({
      where: { raceExternalId: lto.raceExternalId },
      _max: { officialRating: true },
    });
    const maxOr = agg._max.officialRating;
    ltoWasTopRated = maxOr !== null && lto.officialRating >= maxOr;
  }

  return {
    found: true,
    ltoFinishPos: lto.finishPos,
    ltoDistanceBand: lto.distanceBand,
    ltoWasTopRated,
    ltoRaceId: lto.raceExternalId,
    ltoOr: lto.officialRating,
  };
}

/**
 * Cheap structural gate (R1, R2, R7) applied before any per-horse work, so we
 * only do expensive LTO lookups on races that can possibly qualify. Mirrors the
 * "scan the cards" step of the daily process.
 */
export function passesStructuralGate(race: RpRace): boolean {
  const declared = race.fieldSize ?? 0;
  return (
    race.isHandicap &&
    race.isTurf &&
    race.raceTypeCode === "F" && // flat only — excludes jumps
    declared >= MIN_FIELD_SIZE &&
    declared <= MAX_FIELD_SIZE &&
    race.distanceBand !== null &&
    ["6f", "7f", "1m"].includes(race.distanceBand)
  );
}

export interface QualifiedCandidate {
  race: RpRace;
  runner: RpRunner;
  jockeySrPct: number | null;
  jockeyRides: number | null;
  lto: LtoFacts;
  qualifies: boolean;
  failedRule: string | null;
  allRulesPassed: Record<string, boolean>;
}

/**
 * Evaluate the morning favourite of a race against all 9 rules. Per the spec's
 * daily process we only assess the favourite (lowest forecast price); R6 is the
 * morning-favourite check and the SP-cap/drift gate is re-checked live at T-20.
 */
export async function evaluateRace(
  card: { race: RpRace; runners: RpRunner[] },
  opts: {
    jkThreshold?: number;
    jockeySr?: (runner: RpRunner) => Promise<{ srPct: number | null; rides: number | null }>;
  } = {}
): Promise<QualifiedCandidate | null> {
  const jkThreshold = opts.jkThreshold ?? DEFAULT_JK_THRESHOLD;
  const live = card.runners.filter((r) => !r.nonRunner);
  if (live.length === 0) return null;

  // Morning favourite = lowest forecast price.
  const fav = [...live].sort(
    (a, b) =>
      (a.forecastOdds ?? Number.POSITIVE_INFINITY) -
      (b.forecastOdds ?? Number.POSITIVE_INFINITY)
  )[0];

  const before = card.race.startDateTime
    ? new Date(card.race.startDateTime.replace(" ", "T"))
    : new Date();
  const lto = await getLtoFacts(fav.horseName, before);

  const jk = opts.jockeySr
    ? await opts.jockeySr(fav)
    : { srPct: null, rides: null };

  const algoRunner: AlgorithmRunner = {
    horseName: fav.horseName,
    jockey: fav.jockeyName ?? "",
    officialRating: fav.officialRatingToday,
    weightTotalLbs: fav.weightTotalLbs,
    // Forecast price is the morning proxy; the true decimal SP gate is applied
    // live at T-20 against the Betfair price.
    spDecimal: fav.forecastOdds,
    distanceBand: card.race.distanceBand,
    isFavourite: true, // fav by construction; R6 morning-favourite check
    ltoFinishPos: lto.ltoFinishPos,
    ltoWasTopRated: lto.ltoWasTopRated,
    ltoDistanceBand: lto.ltoDistanceBand,
    jockeySrPct: jk.srPct,
    jockeyRides: jk.rides,
  };

  const result = applyAlgorithm(
    {
      isHandicap: card.race.isHandicap,
      isTurf: card.race.isTurf,
      fieldSize: card.race.fieldSize ?? 0,
    },
    algoRunner,
    jkThreshold
  );

  return {
    race: card.race,
    runner: fav,
    jockeySrPct: jk.srPct,
    jockeyRides: jk.rides,
    lto,
    qualifies: result.qualifies,
    failedRule: result.failedRule,
    allRulesPassed: result.allRulesPassed,
  };
}

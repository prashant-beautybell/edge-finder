/**
 * Daily live pipeline. Three stages, each runnable independently from
 * scripts/daily.ts or the scheduler:
 *
 *   ingest  (morning)  -> scrape today's cards, persist races/runners,
 *                         evaluate favourites, create pending QualifyingBets
 *   odds    (T-20 min) -> refresh the live/forecast price + favourite + drift,
 *                         re-apply the SP gate, mark each bet alert/skip
 *   results (T+30 min) -> fetch the result, settle the bet, append to history
 *
 * Per the chosen "alert only" mode, the pipeline never places a bet — it
 * surfaces candidates and tells you what to confirm on Betfair Exchange.
 */

import { prisma } from "@/lib/db";
import {
  fetchMeetings,
  fetchRaceCard,
  type RpRace,
} from "@/lib/sources/racingpost";
import {
  evaluateRace,
  passesStructuralGate,
  type QualifiedCandidate,
} from "@/lib/live/qualify";
import { DEFAULT_JK_THRESHOLD, DEFAULT_STAKE, SP_CAP } from "@/lib/config";
import { recordQualifyingPick } from "@/lib/live/settlement";
import { syncRaceResults } from "@/lib/live-races";

function raceDateOf(race: RpRace): Date {
  const iso = (race.startDateTime ?? "").replace(" ", "T");
  const dt = iso ? new Date(iso) : new Date();
  return new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
}

function raceTimeOf(race: RpRace): Date {
  const iso = (race.startDateTime ?? "").replace(" ", "T");
  return iso ? new Date(iso) : new Date();
}

export interface IngestSummary {
  scannedRaces: number;
  structuralCandidates: number;
  qualifyingBets: number;
  candidates: QualifiedCandidate[];
}

/**
 * Morning ingest. Scrapes the card index, then for each structural candidate
 * fetches the full card, persists race + runners, evaluates the favourite, and
 * creates a pending QualifyingBet when all 9 rules pass.
 */
export async function ingestToday(
  opts: { datePath?: string; jkThreshold?: number; stake?: number } = {}
): Promise<IngestSummary> {
  const jkThreshold = opts.jkThreshold ?? DEFAULT_JK_THRESHOLD;
  const stake = opts.stake ?? DEFAULT_STAKE;

  const allRaces = await fetchMeetings(opts.datePath);
  const structural = allRaces.filter(passesStructuralGate);

  const candidates: QualifiedCandidate[] = [];
  let qualifyingBets = 0;

  for (const race of structural) {
    if (!race.raceUrl) continue;
    const card = await fetchRaceCard(race.raceUrl);
    // The full card has post-declaration field size; re-check the gate.
    if (!passesStructuralGate(card.race)) continue;

    await persistRaceAndRunners(card);

    const candidate = await evaluateRace(card, { jkThreshold });
    if (!candidate) continue;
    candidates.push(candidate);

    if (candidate.qualifies) {
      await upsertQualifyingBet(candidate, { jkThreshold, stake });
      await persistQualifyingFlags(candidate);
      qualifyingBets += 1;
    }
  }

  return {
    scannedRaces: allRaces.length,
    structuralCandidates: structural.length,
    qualifyingBets,
    candidates,
  };
}

async function persistRaceAndRunners(card: {
  race: RpRace;
  runners: { horseName: string; jockeyName: string | null; trainerName: string | null; officialRatingToday: number | null; weightStone: number | null; weightLbs: number | null; weightTotalLbs: number | null; forecastOdds: number | null; nonRunner: boolean }[];
}) {
  const { race } = card;
  const data = {
    course: race.course,
    raceTime: raceTimeOf(race),
    raceName: race.raceTitle,
    raceType: race.raceTypeCode,
    distanceYards: race.distanceYards,
    distanceBand: race.distanceBand,
    going: race.going,
    fieldSize: race.fieldSize,
    isHandicap: race.isHandicap,
    isTurf: race.isTurf,
    raceUrl: race.raceUrl,
    resultUrl: guessResultUrl(race.raceUrl),
    scrapedAt: new Date(),
  };

  await prisma.race.upsert({
    where: { id: race.raceId },
    create: { id: race.raceId, raceDate: raceDateOf(race), ...data },
    update: data,
  });

  // Replace runners for this race (idempotent re-runs through the day).
  await prisma.runner.deleteMany({ where: { raceId: race.raceId } });
  await prisma.runner.createMany({
    data: card.runners.map((r) => ({
      raceId: race.raceId,
      horseName: r.horseName,
      jockey: r.jockeyName,
      trainer: r.trainerName,
      officialRating: r.officialRatingToday,
      weightStone: r.weightStone,
      weightLbs: r.weightLbs,
      weightTotalLbs: r.weightTotalLbs,
      spDecimal: r.forecastOdds,
    })),
  });
}

async function upsertQualifyingBet(
  c: QualifiedCandidate,
  opts: { jkThreshold: number; stake: number }
) {
  const existing = await prisma.qualifyingBet.findFirst({
    where: { raceId: c.race.raceId, horseName: c.runner.horseName },
    select: { id: true },
  });
  const data = {
    course: c.race.course,
    distanceBand: c.race.distanceBand,
    jockey: c.runner.jockeyName,
    jockeySrPct: c.jockeySrPct,
    morningSp: c.runner.forecastOdds,
    jkThreshold: opts.jkThreshold,
    stake: opts.stake,
    status: "pending" as const,
  };
  if (existing) {
    await prisma.qualifyingBet.update({ where: { id: existing.id }, data });
  } else {
    await prisma.qualifyingBet.create({
      data: {
        raceId: c.race.raceId,
        horseName: c.runner.horseName,
        raceDate: raceDateOf(c.race),
        raceTime: raceTimeOf(c.race),
        ...data,
      },
    });
  }

  const runner = await prisma.runner.findFirst({
    where: { raceId: c.race.raceId, horseName: c.runner.horseName },
    select: { id: true },
  });

  await recordQualifyingPick(
    c.race.raceId,
    c.runner.horseName,
    c.runner.jockeyName,
    c.runner.forecastOdds,
    runner?.id ?? null
  );
}

async function persistQualifyingFlags(c: QualifiedCandidate) {
  await prisma.race.update({
    where: { id: c.race.raceId },
    data: { qualifying: true },
  });

  await prisma.runner.updateMany({
    where: { raceId: c.race.raceId },
    data: { qualifies: false, disqualifyReason: null },
  });

  const fav = await prisma.runner.findFirst({
    where: { raceId: c.race.raceId, horseName: c.runner.horseName },
    select: { id: true },
  });

  if (fav) {
    await prisma.runner.update({
      where: { id: fav.id },
      data: { qualifies: true, disqualifyReason: null, isFavourite: true },
    });
  }
}

/**
 * T-20 odds refresh for a single race. Re-fetches the card, recomputes the
 * favourite and the price drift vs. the morning forecast, and re-applies the
 * SP gate. In alert-only mode this sets the bet's status to "alert" (confirm
 * on Betfair) or "skip" (drifted off fav / above 6-4).
 */
export async function refreshOdds(raceId: string): Promise<void> {
  const bet = await prisma.qualifyingBet.findFirst({
    where: { raceId, status: { in: ["pending", "alert"] } },
  });
  if (!bet) return;

  const race = await prisma.race.findUnique({ where: { id: raceId } });
  if (!race?.raceUrl) return;

  const card = await fetchRaceCard(race.raceUrl);
  const live = card.runners.filter((r) => !r.nonRunner);
  const fav = [...live].sort(
    (a, b) =>
      (a.forecastOdds ?? Number.POSITIVE_INFINITY) -
      (b.forecastOdds ?? Number.POSITIVE_INFINITY)
  )[0];

  const livePrice = fav?.forecastOdds ?? null;
  const morning = bet.morningSp ? Number(bet.morningSp) : null;
  const stillFav = fav?.horseName === bet.horseName;
  const driftPct =
    morning && livePrice ? ((livePrice - morning) / morning) * 100 : null;

  // SP gate: must still be favourite, <= 2.50, and not drifted 15%+.
  const passesGate =
    stillFav &&
    livePrice !== null &&
    livePrice <= SP_CAP &&
    (driftPct === null || driftPct < 15);

  await prisma.qualifyingBet.update({
    where: { id: bet.id },
    data: {
      liveSp20min: livePrice,
      status: passesGate ? "alert" : "skip",
    },
  });

  await prisma.liveOdds.create({
    data: {
      raceId,
      horseName: bet.horseName,
      betfairPrice: livePrice,
      isFavourite: stillFav,
      morningPrice: morning,
      priceDriftPct: driftPct,
    },
  });
}

export interface SettleSummary {
  raceId: string;
  horseName: string;
  finishPos: number | null;
  won: boolean;
  placed: boolean;
  pnl: number;
}

/**
 * T+30 results. Fetches the finished race, settles the bet, and appends the
 * runners to HistoricalRace so future LTO lookups stay current.
 */
export async function settleResults(raceId: string): Promise<SettleSummary | null> {
  const bet = await prisma.qualifyingBet.findFirst({
    where: { raceId, status: { in: ["alert", "pending"] } },
  });

  await syncRaceResults(raceId);

  if (!bet) return null;

  const settled = await prisma.qualifyingBet.findUnique({ where: { id: bet.id } });
  if (!settled || settled.status !== "settled") return null;

  return {
    raceId,
    horseName: settled.horseName,
    finishPos: settled.finishPosition,
    won: settled.won ?? false,
    placed: settled.placed ?? false,
    pnl: settled.pnl ? Number(settled.pnl) : 0,
  };
}

function guessResultUrl(raceUrl: string): string | null {
  if (!raceUrl) return null;
  return raceUrl.includes("/results/")
    ? raceUrl
    : raceUrl.replace("/racecards/", "/results/");
}

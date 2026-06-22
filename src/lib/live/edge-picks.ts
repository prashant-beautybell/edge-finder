import { prisma } from "@/lib/db";
import { DEFAULT_JK_THRESHOLD, DEFAULT_STAKE, MIN_FIELD_SIZE, MAX_FIELD_SIZE } from "@/lib/config";
import {
  evaluateRace,
  passesStructuralGate,
  type QualifiedCandidate,
} from "@/lib/live/qualify";
import { recordQualifyingPick } from "@/lib/live/settlement";
import { fetchRaceCard, toRaceCardUrl, type RpRace } from "@/lib/sources/racingpost";
import {
  formatFailedRule,
  type EdgePickDto,
} from "@/lib/live/edge-picks-types";

export { formatFailedRule, RULE_LABELS, type EdgePickDto } from "@/lib/live/edge-picks-types";

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function endOfDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999)
  );
}

async function jockeySrForLive(jockey: string | null, seasonYear: number) {
  if (!jockey) return { srPct: null, rides: null };
  const stat = await prisma.jockeyStat.findUnique({
    where: { jockey_seasonYear: { jockey, seasonYear } },
  });
  if (!stat) return { srPct: null, rides: null };
  return {
    srPct: stat.strikeRatePct ? Number(stat.strikeRatePct) : null,
    rides: stat.turfHandicapRides,
  };
}

function candidateToDto(
  raceId: string,
  course: string,
  raceTime: Date,
  raceName: string | null,
  distanceBand: string | null,
  structural: boolean,
  evaluated: boolean,
  candidate: QualifiedCandidate | null,
  runnerId: number | null
): EdgePickDto {
  return {
    raceId,
    course,
    raceTime: raceTime.toISOString(),
    raceName,
    distanceBand,
    structuralCandidate: structural,
    evaluated,
    qualifies: candidate?.qualifies ?? false,
    horseName: candidate?.runner.horseName ?? null,
    jockey: candidate?.runner.jockeyName ?? null,
    morningSp: candidate?.runner.forecastOdds ?? null,
    failedRule: candidate?.failedRule ?? null,
    failedRuleLabel: candidate
      ? formatFailedRule(candidate.failedRule)
      : structural
        ? "Card not loaded"
        : "Not a structural candidate",
    runnerId,
  };
}

async function persistEvaluation(
  raceId: string,
  candidate: QualifiedCandidate,
  jkThreshold: number
) {
  const favName = candidate.runner.horseName;

  await prisma.race.update({
    where: { id: raceId },
    data: { qualifying: candidate.qualifies },
  });

  await prisma.runner.updateMany({
    where: { raceId },
    data: { qualifies: false, disqualifyReason: null },
  });

  const favRunner = await prisma.runner.findFirst({
    where: { raceId, horseName: favName },
    select: { id: true },
  });

  if (favRunner) {
    await prisma.runner.update({
      where: { id: favRunner.id },
      data: {
        qualifies: candidate.qualifies,
        disqualifyReason: candidate.failedRule,
        isFavourite: true,
      },
    });
  }

  if (!candidate.qualifies) return;

  const race = await prisma.race.findUnique({ where: { id: raceId } });
  if (!race) return;

  const existing = await prisma.qualifyingBet.findFirst({
    where: { raceId, horseName: favName },
    select: { id: true },
  });

  const betData = {
    runnerId: favRunner?.id ?? null,
    course: race.course,
    distanceBand: race.distanceBand,
    jockey: candidate.runner.jockeyName,
    jockeySrPct: candidate.jockeySrPct,
    morningSp: candidate.runner.forecastOdds,
    jkThreshold,
    stake: DEFAULT_STAKE,
    status: "pending" as const,
  };

  if (existing) {
    await prisma.qualifyingBet.update({ where: { id: existing.id }, data: betData });
  } else {
    await prisma.qualifyingBet.create({
      data: {
        raceId,
        horseName: favName,
        raceDate: race.raceDate,
        raceTime: race.raceTime,
        ...betData,
      },
    });
  }

  await recordQualifyingPick(
    raceId,
    favName,
    candidate.runner.jockeyName,
    candidate.runner.forecastOdds,
    favRunner?.id ?? null
  );
}

export async function evaluateRaceFromCard(
  raceId: string,
  card: { race: RpRace; runners: Parameters<typeof evaluateRace>[0]["runners"] },
  jkThreshold = DEFAULT_JK_THRESHOLD
): Promise<EdgePickDto | null> {
  const structural = passesStructuralGate(card.race);
  if (!structural) {
    const race = await prisma.race.findUnique({ where: { id: raceId } });
    if (!race) return null;
    return candidateToDto(
      raceId,
      race.course,
      race.raceTime,
      race.raceName,
      race.distanceBand,
      false,
      false,
      null,
      null
    );
  }

  const seasonYear = card.race.startDateTime
    ? new Date(card.race.startDateTime.replace(" ", "T")).getFullYear()
    : new Date().getFullYear();

  const candidate = await evaluateRace(card, {
    jkThreshold,
    jockeySr: async (runner) => jockeySrForLive(runner.jockeyName, seasonYear),
  });

  if (!candidate) return null;

  await persistEvaluation(raceId, candidate, jkThreshold);

  const favRunner = await prisma.runner.findFirst({
    where: { raceId, horseName: candidate.runner.horseName },
    select: { id: true },
  });

  const race = await prisma.race.findUnique({ where: { id: raceId } });
  if (!race) return null;

  return candidateToDto(
    raceId,
    race.course,
    race.raceTime,
    race.raceName,
    race.distanceBand,
    true,
    true,
    candidate,
    favRunner?.id ?? null
  );
}

function shouldAttemptEdgeScan(race: Parameters<typeof rpStubFromRace>[0]): boolean {
  if (!race.raceUrl) return false;
  if (passesStructuralGate(rpStubFromRace(race))) return true;

  // RP meeting index often omits distanceYards — still try likely flat turf handicaps.
  if (!race.isHandicap || !race.isTurf || race.raceType !== "F") return false;
  const size = race.fieldSize ?? 0;
  if (size > 0 && (size < MIN_FIELD_SIZE || size > MAX_FIELD_SIZE)) return false;
  return true;
}

async function syncRaceMetadataFromCard(
  raceId: string,
  card: { race: RpRace; runners: Parameters<typeof evaluateRace>[0]["runners"] }
) {
  const activeCount = card.runners.filter((r) => !r.nonRunner).length;
  await prisma.race.update({
    where: { id: raceId },
    data: {
      fieldSize: activeCount,
      distanceYards: card.race.distanceYards,
      distanceBand: card.race.distanceBand,
      going: card.race.going,
      isHandicap: card.race.isHandicap,
      isTurf: card.race.isTurf,
      raceName: card.race.raceTitle,
      raceType: card.race.raceTypeCode,
      status: card.race.isResult ? "resulted" : "card_loaded",
      scrapedAt: new Date(),
    },
  });
}
export async function evaluateRaceById(
  raceId: string,
  jkThreshold = DEFAULT_JK_THRESHOLD
): Promise<EdgePickDto | null> {
  const race = await prisma.race.findUnique({ where: { id: raceId } });
  if (!race?.raceUrl) return null;

  const card = await fetchRaceCard(toRaceCardUrl(race.raceUrl));
  await syncRaceMetadataFromCard(raceId, card);
  return evaluateRaceFromCard(raceId, card, jkThreshold);
}

export interface ScanEdgePicksResult {
  scanned: number;
  structural: number;
  qualifying: number;
  picks: EdgePickDto[];
}

function rpStubFromRace(race: {
  id: string;
  course: string;
  raceName: string | null;
  raceTime: Date;
  raceType: string | null;
  distanceYards: number | null;
  distanceBand: string | null;
  going: string | null;
  fieldSize: number | null;
  isHandicap: boolean;
  isTurf: boolean;
  status: string;
  raceUrl: string | null;
}): RpRace {
  return {
    raceId: race.id,
    course: race.course,
    country: "GB",
    raceTitle: race.raceName ?? "",
    startDateTime: race.raceTime.toISOString(),
    raceTypeCode: race.raceType,
    distanceYards: race.distanceYards,
    distanceBand: race.distanceBand,
    going: race.going,
    fieldSize: race.fieldSize,
    isHandicap: race.isHandicap,
    isTurf: race.isTurf,
    isResult: race.status === "resulted",
    raceUrl: race.raceUrl ?? "",
    resultUrl: null,
  };
}

export async function scanTodayEdgePicks(date = new Date()): Promise<ScanEdgePicksResult> {
  const from = startOfDay(date);
  const to = endOfDay(date);

  const races = await prisma.race.findMany({
    where: { raceDate: { gte: from, lte: to } },
    orderBy: { raceTime: "asc" },
  });

  const picks: EdgePickDto[] = [];
  let structural = 0;
  let qualifying = 0;

  for (const race of races) {
    if (!shouldAttemptEdgeScan(race)) continue;

    try {
      const pick = await evaluateRaceById(race.id);
      if (!pick?.structuralCandidate) continue;

      structural += 1;
      picks.push(pick);
      if (pick.qualifies) qualifying += 1;
    } catch (error) {
      console.error(`Edge scan failed for ${race.id}:`, error);
      picks.push(
        candidateToDto(
          race.id,
          race.course,
          race.raceTime,
          race.raceName,
          race.distanceBand,
          true,
          false,
          null,
          null
        )
      );
      structural += 1;
    }
  }

  return { scanned: races.length, structural, qualifying, picks };
}

export async function listTodayEdgePicks(date = new Date()): Promise<EdgePickDto[]> {
  const from = startOfDay(date);
  const to = endOfDay(date);

  const races = await prisma.race.findMany({
    where: { raceDate: { gte: from, lte: to } },
    include: {
      runners: {
        where: { OR: [{ qualifies: true }, { isFavourite: true }] },
        orderBy: [{ qualifies: "desc" }, { isFavourite: "desc" }, { id: "asc" }],
        take: 1,
      },
    },
    orderBy: { raceTime: "asc" },
  });

  return races
    .map((race) => {
      if (!passesStructuralGate(rpStubFromRace(race))) return null;

      const fav = race.runners[0];
      const evaluated = Boolean(fav);

      const pick: EdgePickDto = {
        raceId: race.id,
        course: race.course,
        raceTime: race.raceTime.toISOString(),
        raceName: race.raceName,
        distanceBand: race.distanceBand,
        structuralCandidate: true,
        evaluated,
        qualifies: fav?.qualifies ?? false,
        horseName: fav?.horseName ?? null,
        jockey: fav?.jockey ?? null,
        morningSp: fav?.spDecimal ? Number(fav.spDecimal) : null,
        failedRule: fav?.disqualifyReason ?? null,
        failedRuleLabel: evaluated
          ? formatFailedRule(fav?.disqualifyReason ?? null)
          : "Card not loaded",
        runnerId: fav?.id ?? null,
      };

      return pick;
    })
    .filter((p): p is EdgePickDto => p !== null);
}

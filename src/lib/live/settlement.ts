import { prisma } from "@/lib/db";
import { DEFAULT_STAKE } from "@/lib/config";
import type { RpResultRunner } from "@/lib/sources/racingpost";

function pnlForBet(won: boolean, sp: number | null, stake: number): number {
  if (won && sp) return (sp - 1) * stake;
  return -stake;
}

/** Persist today's strong edge to historical_races so charts/KPIs update after settlement. */
export async function recordQualifyingPick(
  raceId: string,
  horseName: string,
  jockey: string | null,
  morningSp: number | null,
  runnerId: number | null
): Promise<void> {
  const race = await prisma.race.findUnique({ where: { id: raceId } });
  if (!race) return;

  const runner = runnerId
    ? await prisma.runner.findUnique({ where: { id: runnerId } })
    : null;

  const year = race.raceDate.getUTCFullYear();
  const data = {
    raceExternalId: raceId,
    raceDate: race.raceDate,
    course: race.course,
    raceName: race.raceName,
    horseName,
    jockey: jockey ?? runner?.jockey ?? null,
    trainer: runner?.trainer ?? null,
    officialRating: runner?.officialRating ?? null,
    weightTotalLbs: runner?.weightTotalLbs ?? null,
    distanceBand: race.distanceBand,
    spDecimal: morningSp,
    fieldSize: race.fieldSize,
    isHandicap: race.isHandicap,
    isTurf: race.isTurf,
    year,
    qualified: true,
    failedRule: null,
  };

  const existing = await prisma.historicalRace.findFirst({
    where: { raceExternalId: raceId, horseName, qualified: true },
    select: { id: true },
  });

  if (existing) {
    await prisma.historicalRace.update({ where: { id: existing.id }, data });
  } else {
    await prisma.historicalRace.create({ data });
  }
}

export async function appendRaceHistory(
  race: {
    id: string;
    raceDate: Date;
    course: string;
    raceName: string | null;
    distanceBand: string | null;
    fieldSize: number | null;
    isHandicap: boolean;
    isTurf: boolean;
  },
  results: RpResultRunner[]
): Promise<void> {
  const runners = await prisma.runner.findMany({ where: { raceId: race.id } });
  const byName = new Map(runners.map((r) => [r.horseName, r]));
  const year = race.raceDate.getUTCFullYear();

  for (const res of results) {
    const already = await prisma.historicalRace.findFirst({
      where: { raceExternalId: race.id, horseName: res.horseName },
      select: { id: true },
    });
    if (already) continue;

    const runner = byName.get(res.horseName);
    await prisma.historicalRace.create({
      data: {
        raceExternalId: race.id,
        raceDate: race.raceDate,
        course: race.course,
        raceName: race.raceName,
        horseName: res.horseName,
        jockey: runner?.jockey ?? null,
        trainer: runner?.trainer ?? null,
        finishPos: res.finishPos,
        officialRating: runner?.officialRating ?? null,
        weightTotalLbs: runner?.weightTotalLbs ?? null,
        distanceBand: race.distanceBand,
        spDecimal: res.spDecimal,
        fieldSize: race.fieldSize,
        isHandicap: race.isHandicap,
        isTurf: race.isTurf,
        year,
        won: res.finishPos === 1,
        placed: res.finishPos !== null && res.finishPos <= 3,
      },
    });
  }
}

export async function settleRaceFromResults(
  raceId: string,
  results: RpResultRunner[]
): Promise<{ settled: number }> {
  const race = await prisma.race.findUnique({ where: { id: raceId } });
  if (!race) return { settled: 0 };

  await appendRaceHistory(race, results);

  const resultByHorse = new Map(
    results.map((r) => [r.horseName.toLowerCase().trim(), r])
  );

  const bets = await prisma.qualifyingBet.findMany({
    where: { raceId, status: { not: "settled" } },
  });

  let settled = 0;

  for (const bet of bets) {
    const result = resultByHorse.get(bet.horseName.toLowerCase().trim());
    if (!result) continue;

    const finishPos = result.finishPos;
    const won = finishPos === 1;
    const placed = finishPos !== null && finishPos <= 3;
    const stake = bet.stake ? Number(bet.stake) : DEFAULT_STAKE;
    const sp =
      result.spDecimal ??
      (bet.liveSp20min
        ? Number(bet.liveSp20min)
        : bet.morningSp
          ? Number(bet.morningSp)
          : null);
    const pnl = pnlForBet(won, sp, stake);

    await prisma.qualifyingBet.update({
      where: { id: bet.id },
      data: {
        finishPosition: finishPos,
        finalSp: sp,
        won,
        placed,
        pnl,
        status: "settled",
        resultFetchedAt: new Date(),
      },
    });

    await prisma.historicalRace.updateMany({
      where: {
        raceExternalId: raceId,
        horseName: bet.horseName,
        qualified: true,
      },
      data: { finishPos, spDecimal: sp, won, placed, pnl },
    });

    settled += 1;
  }

  const pendingQualified = await prisma.historicalRace.findMany({
    where: { raceExternalId: raceId, qualified: true, finishPos: null },
  });

  for (const row of pendingQualified) {
    const horse = row.horseName?.toLowerCase().trim() ?? "";
    const result = resultByHorse.get(horse);
    if (!result) continue;

    const finishPos = result.finishPos;
    const won = finishPos === 1;
    const placed = finishPos !== null && finishPos <= 3;
    const sp = result.spDecimal ?? (row.spDecimal ? Number(row.spDecimal) : null);
    const pnl = pnlForBet(won, sp, DEFAULT_STAKE);

    await prisma.historicalRace.update({
      where: { id: row.id },
      data: { finishPos, spDecimal: sp, won, placed, pnl },
    });
  }

  return { settled };
}

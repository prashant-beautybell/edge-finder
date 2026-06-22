import { prisma } from "@/lib/db";
import { usesLocalSqlite } from "@/lib/db-mode";

export interface HealthSnapshot {
  totalRows: number;
  qualifiedRows: number;
  latestRaceDate: string | null;
}

let cache: { data: HealthSnapshot; expiresAt: number } | null = null;
const CACHE_TTL_MS = 300_000;

export async function getHealthSnapshot(): Promise<HealthSnapshot> {
  if (cache && Date.now() < cache.expiresAt) {
    return cache.data;
  }

  const totalRows = usesLocalSqlite()
    ? await prisma.historicalRace.count()
    : Number(
        (
          await prisma.$queryRaw<Array<{ total: bigint }>>`
            SELECT COALESCE(reltuples::bigint, 0) AS total
            FROM pg_class
            WHERE relname = 'historical_races'
          `
        )[0]?.total ?? 0
      );

  const qualifiedRows = await prisma.historicalRace.count({
    where: { qualified: true },
  });

  const latest = await prisma.historicalRace.findFirst({
    where: { qualified: true },
    orderBy: { raceDate: "desc" },
    select: { raceDate: true },
  });

  const data: HealthSnapshot = {
    totalRows,
    qualifiedRows,
    latestRaceDate: latest?.raceDate?.toISOString().slice(0, 10) ?? null,
  };

  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS };
  return data;
}

export function clearHealthCache(): void {
  cache = null;
}

import { getFootballPrisma, getRacingPrisma } from "@/lib/db-sport";
import { getDatabaseLabel } from "@/lib/db-config";
import type { SportId } from "@/lib/sports";

export async function getSportHealth(sport: SportId) {
  if (sport === "football") {
    const db = getFootballPrisma();
    const [fixtures, qualifying] = await Promise.all([
      db.footballFixture.count(),
      db.footballQualifyingBet.count({ where: { status: "pending" } }),
    ]);
    return {
      ok: true,
      sport,
      totalRows: fixtures,
      qualifiedRows: qualifying,
      latestRaceDate: null,
      database: usesFootballDbLabel(),
    };
  }

  const db = getRacingPrisma();
  const [totalRows, qualifiedRows, latest] = await Promise.all([
    db.historicalRace.count(),
    db.historicalRace.count({ where: { qualified: true } }),
    db.historicalRace.findFirst({
      where: { qualified: true },
      orderBy: { raceDate: "desc" },
      select: { raceDate: true },
    }),
  ]);

  return {
    ok: true,
    sport,
    totalRows,
    qualifiedRows,
    latestRaceDate: latest?.raceDate?.toISOString().slice(0, 10) ?? null,
    database: getDatabaseLabel(),
  };
}

function usesFootballDbLabel(): string {
  if (process.env.VERCEL) return "Football Postgres";
  if (process.env.USE_LOCAL_DB === "false") return "Football Postgres";
  return "Football SQLite";
}

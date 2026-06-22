import "dotenv/config";
import { prisma } from "../src/lib/db";

async function main() {
  const total = await prisma.historicalRace.count();
  const qualified = await prisma.historicalRace.count({ where: { qualified: true } });
  const turfHc = await prisma.historicalRace.count({
    where: { isHandicap: true, isTurf: true },
  });

  const failed = await prisma.historicalRace.groupBy({
    by: ["failedRule"],
    where: {
      isHandicap: true,
      isTurf: true,
      distanceBand: { in: ["6f", "7f", "1m"] },
      fieldSize: { gte: 6, lte: 12 },
    },
    _count: true,
    orderBy: { _count: { failedRule: "desc" } },
    take: 15,
  });

  const qualifying = await prisma.historicalRace.findMany({
    where: { qualified: true },
    select: {
      horseName: true,
      course: true,
      raceDate: true,
      year: true,
      spDecimal: true,
      won: true,
      failedRule: true,
    },
  });

  console.log({ total, qualified, turfHc });
  console.log("\nTop failure rules:");
  for (const row of failed) {
    console.log(`  ${row.failedRule}: ${row._count}`);
  }
  console.log("\nQualifying bets:");
  console.log(qualifying);
}

main()
  .finally(() => prisma.$disconnect());

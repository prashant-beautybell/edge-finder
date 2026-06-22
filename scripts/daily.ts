/**
 * CLI entry point for the daily live pipeline.
 *
 *   tsx scripts/daily.ts ingest            # morning: scrape + qualify + create bets
 *   tsx scripts/daily.ts odds <raceId>     # T-20: refresh price + SP gate
 *   tsx scripts/daily.ts results <raceId>  # T+30: settle + append history
 *   tsx scripts/daily.ts odds-all          # refresh every pending bet
 *   tsx scripts/daily.ts results-all       # settle every alerted bet
 *
 * The scheduler (scripts/scheduler.ts) calls these same functions in-process;
 * this CLI is for manual runs and cron one-offs.
 */
import "dotenv/config";
import { prisma } from "../src/lib/db";
import {
  ingestToday,
  refreshOdds,
  settleResults,
} from "../src/lib/live/pipeline";

async function main() {
  const [cmd, arg] = process.argv.slice(2);

  switch (cmd) {
    case "ingest": {
      const summary = await ingestToday();
      console.log(
        `Scanned ${summary.scannedRaces} races · ${summary.structuralCandidates} structural candidates · ${summary.qualifyingBets} qualifying bet(s)`
      );
      for (const c of summary.candidates) {
        const tag = c.qualifies ? "✅ QUALIFIES" : `✗ ${c.failedRule}`;
        console.log(
          `  ${tag.padEnd(16)} ${c.race.course} ${c.race.startDateTime ?? ""} | ${c.runner.horseName} (fc ${c.runner.forecastOdds}) | ${c.race.distanceBand}`
        );
      }
      break;
    }
    case "odds": {
      if (!arg) throw new Error("usage: daily.ts odds <raceId>");
      await refreshOdds(arg);
      console.log(`Refreshed odds for race ${arg}`);
      break;
    }
    case "odds-all": {
      const bets = await prisma.qualifyingBet.findMany({
        where: { status: "pending" },
        select: { raceId: true },
        distinct: ["raceId"],
      });
      for (const b of bets) await refreshOdds(b.raceId);
      console.log(`Refreshed odds for ${bets.length} race(s)`);
      break;
    }
    case "results": {
      if (!arg) throw new Error("usage: daily.ts results <raceId>");
      const r = await settleResults(arg);
      console.log(r ? `Settled: ${JSON.stringify(r)}` : "Nothing to settle");
      break;
    }
    case "results-all": {
      const bets = await prisma.qualifyingBet.findMany({
        where: { status: { in: ["alert", "pending"] } },
        select: { raceId: true },
        distinct: ["raceId"],
      });
      for (const b of bets) await settleResults(b.raceId);
      console.log(`Attempted settlement for ${bets.length} race(s)`);
      break;
    }
    default:
      console.log(
        "Commands: ingest | odds <raceId> | odds-all | results <raceId> | results-all"
      );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

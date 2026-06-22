/**
 * Long-running scheduler. Run with: `npm run scheduler` (keep it alive with
 * pm2/systemd/launchd in production).
 *
 *   - 07:00 daily: ingest today's cards and create qualifying bets, then
 *     schedule per-race odds (T-20) and results (T+30) jobs off each race's
 *     real off-time — so timing is exact, not a fixed clock tick.
 *
 * Uses node-cron for the daily trigger and plain setTimeout for the per-race
 * jobs (which are one-shot and time-relative).
 */
import "dotenv/config";
import cron from "node-cron";
import { prisma } from "../src/lib/db";
import { ingestToday, refreshOdds, settleResults } from "../src/lib/live/pipeline";

const ODDS_LEAD_MIN = Number(process.env.ODDS_LEAD_MIN ?? 20);
const RESULTS_LAG_MIN = Number(process.env.RESULTS_LAG_MIN ?? 30);
const CRON_TZ = process.env.SCHEDULER_TZ ?? "Europe/London";
const MORNING_CRON = process.env.MORNING_CRON ?? "0 7 * * *";

function log(msg: string) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

/** Schedule the per-race odds + results jobs for everything ingested today. */
async function scheduleRaceJobs() {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const bets = await prisma.qualifyingBet.findMany({
    where: { status: { in: ["pending", "alert"] }, raceDate: { gte: start } },
    select: { raceId: true, raceTime: true, horseName: true },
  });

  const now = Date.now();
  for (const bet of bets) {
    const off = bet.raceTime.getTime();
    const oddsAt = off - ODDS_LEAD_MIN * 60_000;
    const resultsAt = off + RESULTS_LAG_MIN * 60_000;

    scheduleOnce(oddsAt - now, async () => {
      log(`T-${ODDS_LEAD_MIN} odds refresh: ${bet.horseName} (${bet.raceId})`);
      await refreshOdds(bet.raceId).catch((e) => log(`odds error: ${e.message}`));
    });
    scheduleOnce(resultsAt - now, async () => {
      log(`T+${RESULTS_LAG_MIN} settle: ${bet.horseName} (${bet.raceId})`);
      const r = await settleResults(bet.raceId).catch((e) => {
        log(`results error: ${e.message}`);
        return null;
      });
      if (r) log(`settled ${r.horseName}: pos ${r.finishPos} pnl ${r.pnl}`);
    });
  }
  log(`Scheduled odds+results jobs for ${bets.length} qualifying bet(s)`);
}

function scheduleOnce(delayMs: number, fn: () => void) {
  // setTimeout caps at ~24.8 days; our delays are always intraday so this is safe.
  if (delayMs <= 0) {
    // Already past — run shortly so we don't miss late starts.
    setTimeout(fn, 1_000);
  } else {
    setTimeout(fn, delayMs);
  }
}

async function runMorning() {
  log("Morning ingest starting…");
  const summary = await ingestToday();
  log(
    `Ingest done: ${summary.structuralCandidates} candidates, ${summary.qualifyingBets} qualifying bet(s)`
  );
  await scheduleRaceJobs();
}

log(`Scheduler up. Morning cron "${MORNING_CRON}" (${CRON_TZ}).`);
cron.schedule(MORNING_CRON, () => {
  runMorning().catch((e) => log(`morning error: ${e.message}`));
}, { timezone: CRON_TZ });

// On boot, if it's already daytime, schedule today's remaining jobs immediately.
scheduleRaceJobs().catch((e) => log(`boot schedule error: ${e.message}`));

// If launched with `--now`, run the morning ingest immediately (handy for testing).
if (process.argv.includes("--now")) {
  runMorning().catch((e) => log(`--now error: ${e.message}`));
}

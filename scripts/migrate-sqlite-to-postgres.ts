import "dotenv/config";
import path from "path";
import Database from "better-sqlite3";
import { PrismaClient } from "@prisma/client";

const SQLITE_PATH =
  process.env.SQLITE_PATH ?? path.resolve(process.cwd(), "prisma/dev.db");
const BATCH_SIZE = 2000;

const prisma = new PrismaClient();

function bool(value: unknown): boolean {
  return value === 1 || value === true;
}

function boolOrNull(value: unknown): boolean | null {
  if (value === null || value === undefined) return null;
  return bool(value);
}

function numOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  return Number(value);
}

function decOrNull(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return String(value);
}

function toDate(value: unknown): Date {
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string" && value.length > 0) return new Date(value);
  throw new Error(`Invalid date value: ${String(value)}`);
}

function dateOrNull(value: unknown): Date | null {
  if (value === null || value === undefined || value === "") return null;
  if (value instanceof Date) return value;
  if (typeof value === "number") return new Date(value);
  if (typeof value === "string") return new Date(value);
  return null;
}

async function migrateRaces(db: Database.Database) {
  const rows = db.prepare("SELECT * FROM races").all() as Record<string, unknown>[];
  if (rows.length === 0) return;

  await prisma.race.createMany({
    data: rows.map((row) => ({
      id: String(row.id),
      raceDate: toDate(row.race_date),
      course: String(row.course),
      raceTime: toDate(row.race_time),
      raceName: row.race_name ? String(row.race_name) : null,
      raceType: row.race_type ? String(row.race_type) : null,
      distanceYards: numOrNull(row.distance_yards),
      distanceBand: row.distance_band ? String(row.distance_band) : null,
      going: row.going ? String(row.going) : null,
      fieldSize: numOrNull(row.field_size),
      isHandicap: bool(row.is_handicap),
      isTurf: bool(row.is_turf),
      qualifying: bool(row.qualifying),
      raceUrl: row.race_url ? String(row.race_url) : null,
      resultUrl: row.result_url ? String(row.result_url) : null,
      betfairMarketId: row.betfair_market_id ? String(row.betfair_market_id) : null,
      marketTotalMatched: decOrNull(row.market_total_matched),
      status: row.status ? String(row.status) : "scheduled",
      scrapedAt: dateOrNull(row.scraped_at),
      createdAt: dateOrNull(row.created_at) ?? new Date(),
    })),
    skipDuplicates: true,
  });
  console.log(`  races: ${rows.length}`);
}

async function migrateRunners(db: Database.Database) {
  const rows = db.prepare("SELECT * FROM runners").all() as Record<string, unknown>[];
  if (rows.length === 0) return;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await prisma.runner.createMany({
      data: batch.map((row) => ({
        id: Number(row.id),
        raceId: String(row.race_id),
        horseName: String(row.horse_name),
        jockey: row.jockey ? String(row.jockey) : null,
        trainer: row.trainer ? String(row.trainer) : null,
        officialRating: numOrNull(row.official_rating),
        weightStone: numOrNull(row.weight_stone),
        weightLbs: numOrNull(row.weight_lbs),
        weightTotalLbs: numOrNull(row.weight_total_lbs),
        draw: numOrNull(row.draw),
        spDecimal: decOrNull(row.sp_decimal),
        finishPosition: numOrNull(row.finish_position),
        isWinner: boolOrNull(row.is_winner),
        isPlaced: boolOrNull(row.is_placed),
        isFavourite: boolOrNull(row.is_favourite),
        ltoRaceId: row.lto_race_id ? String(row.lto_race_id) : null,
        ltoFinishPos: numOrNull(row.lto_finish_pos),
        ltoOr: numOrNull(row.lto_or),
        ltoWasTopRated: boolOrNull(row.lto_was_top_rated),
        ltoDistanceBand: row.lto_distance_band ? String(row.lto_distance_band) : null,
        ltoSameDistance: boolOrNull(row.lto_same_distance),
        jockeySrPct: decOrNull(row.jockey_sr_pct),
        jockeyRides: numOrNull(row.jockey_rides),
        qualifies: bool(row.qualifies),
        disqualifyReason: row.disqualify_reason ? String(row.disqualify_reason) : null,
        createdAt: dateOrNull(row.created_at) ?? new Date(),
      })),
      skipDuplicates: true,
    });
  }
  console.log(`  runners: ${rows.length}`);
}

async function migrateLiveOdds(db: Database.Database) {
  const rows = db.prepare("SELECT * FROM live_odds").all() as Record<string, unknown>[];
  if (rows.length === 0) return;

  await prisma.liveOdds.createMany({
    data: rows.map((row) => ({
      id: Number(row.id),
      raceId: String(row.race_id),
      horseName: row.horse_name ? String(row.horse_name) : null,
      betfairPrice: decOrNull(row.betfair_price),
      layPrice: decOrNull(row.lay_price),
      backSize: decOrNull(row.back_size),
      laySize: decOrNull(row.lay_size),
      isFavourite: boolOrNull(row.is_favourite),
      matchedVolume: decOrNull(row.matched_volume),
      morningPrice: decOrNull(row.morning_price),
      priceDriftPct: decOrNull(row.price_drift_pct),
      fetchedAt: dateOrNull(row.fetched_at) ?? new Date(),
    })),
    skipDuplicates: true,
  });
  console.log(`  live_odds: ${rows.length}`);
}

async function migrateQualifyingBets(db: Database.Database) {
  const rows = db.prepare("SELECT * FROM qualifying_bets").all() as Record<string, unknown>[];
  if (rows.length === 0) return;

  await prisma.qualifyingBet.createMany({
    data: rows.map((row) => ({
      id: Number(row.id),
      raceId: String(row.race_id),
      runnerId: numOrNull(row.runner_id),
      horseName: String(row.horse_name),
      raceDate: toDate(row.race_date),
      raceTime: toDate(row.race_time),
      course: String(row.course),
      distanceBand: row.distance_band ? String(row.distance_band) : null,
      jockey: row.jockey ? String(row.jockey) : null,
      jockeySrPct: decOrNull(row.jockey_sr_pct),
      morningSp: decOrNull(row.morning_sp),
      liveSp20min: decOrNull(row.live_sp_20min),
      finalSp: decOrNull(row.final_sp),
      jkThreshold: numOrNull(row.jk_threshold),
      stake: decOrNull(row.stake),
      betPlaced: bool(row.bet_placed),
      finishPosition: numOrNull(row.finish_position),
      won: boolOrNull(row.won),
      placed: boolOrNull(row.placed),
      pnl: decOrNull(row.pnl),
      resultFetchedAt: dateOrNull(row.result_fetched_at),
      status: row.status ? String(row.status) : "pending",
      createdAt: dateOrNull(row.created_at) ?? new Date(),
    })),
    skipDuplicates: true,
  });
  console.log(`  qualifying_bets: ${rows.length}`);
}

async function migrateJockeyStats(db: Database.Database) {
  const rows = db.prepare("SELECT * FROM jockey_stats").all() as Record<string, unknown>[];
  if (rows.length === 0) return;

  await prisma.jockeyStat.createMany({
    data: rows.map((row) => ({
      id: Number(row.id),
      jockey: String(row.jockey),
      seasonYear: Number(row.season_year),
      turfHandicapWins: Number(row.turf_handicap_wins ?? 0),
      turfHandicapRides: Number(row.turf_handicap_rides ?? 0),
      strikeRatePct: decOrNull(row.strike_rate_pct),
      updatedAt: dateOrNull(row.updated_at) ?? new Date(),
    })),
    skipDuplicates: true,
  });
  console.log(`  jockey_stats: ${rows.length}`);
}

async function migrateHistoricalRaces(db: Database.Database) {
  const countRow = db.prepare("SELECT COUNT(*) AS count FROM historical_races").get() as {
    count: number;
  };
  const total = countRow.count;
  if (total === 0) return;

  let migrated = 0;

  while (migrated < total) {
    const batch = db
      .prepare(`SELECT * FROM historical_races ORDER BY id LIMIT ? OFFSET ?`)
      .all(BATCH_SIZE, migrated) as Record<string, unknown>[];

    if (batch.length === 0) break;

    await prisma.historicalRace.createMany({
      data: batch.map((row) => ({
        id: Number(row.id),
        raceExternalId: row.race_external_id ? String(row.race_external_id) : null,
        raceDate: dateOrNull(row.race_date),
        course: row.course ? String(row.course) : null,
        raceName: row.race_name ? String(row.race_name) : null,
        horseName: row.horse_name ? String(row.horse_name) : null,
        jockey: row.jockey ? String(row.jockey) : null,
        trainer: row.trainer ? String(row.trainer) : null,
        finishPos: numOrNull(row.finish_pos),
        officialRating: numOrNull(row.official_rating),
        weightTotalLbs: numOrNull(row.weight_total_lbs),
        distanceBand: row.distance_band ? String(row.distance_band) : null,
        spDecimal: decOrNull(row.sp_decimal),
        fieldSize: numOrNull(row.field_size),
        isHandicap: boolOrNull(row.is_handicap),
        isTurf: boolOrNull(row.is_turf),
        year: numOrNull(row.year),
        qualified: bool(row.qualified),
        won: boolOrNull(row.won),
        placed: boolOrNull(row.placed),
        pnl: decOrNull(row.pnl),
        failedRule: row.failed_rule ? String(row.failed_rule) : null,
      })),
      skipDuplicates: true,
    });

    migrated += batch.length;
    if (migrated % 50000 === 0 || migrated === total) {
      console.log(`  historical_races: ${migrated.toLocaleString()} / ${total.toLocaleString()}`);
    }
  }
}

async function resetSequences() {
  const tables = [
    { table: "runners", column: "id" },
    { table: "live_odds", column: "id" },
    { table: "qualifying_bets", column: "id" },
    { table: "jockey_stats", column: "id" },
    { table: "historical_races", column: "id" },
  ];

  for (const { table, column } of tables) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${table}"', '${column}'), COALESCE((SELECT MAX("${column}") FROM "${table}"), 1))`
    );
  }
}

async function main() {
  console.log(`Reading SQLite from ${SQLITE_PATH}`);
  const db = new Database(SQLITE_PATH, { readonly: true });

  console.log("Pushing schema is assumed done. Copying data...");
  await migrateRaces(db);
  await migrateRunners(db);
  await migrateLiveOdds(db);
  await migrateQualifyingBets(db);
  await migrateJockeyStats(db);
  await migrateHistoricalRaces(db);

  console.log("Resetting Postgres sequences...");
  await resetSequences();

  db.close();
  await prisma.$disconnect();
  console.log("Migration complete.");
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

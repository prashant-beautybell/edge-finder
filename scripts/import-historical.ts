import "dotenv/config";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { prisma } from "../src/lib/db";
import { buildBacktestDataset, summarizeBacktest } from "../src/lib/backtest-engine";
import { DEFAULT_JK_THRESHOLD } from "../src/lib/config";
import type { CsvRow } from "../src/lib/csv-utils";

function parseArgs() {
  const args = process.argv.slice(2);
  const years: number[] = [];
  let dataDir = path.resolve(
    process.env.HISTORICAL_DATA_DIR ??
      "/Users/prashanttripathi/Downloads/RacingFormBookDatabase/RacingFormBook_exported"
  );
  let clear = false;

  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--year" && args[i + 1]) {
      years.push(Number(args[i + 1]));
      i += 1;
    } else if (args[i] === "--data-dir" && args[i + 1]) {
      dataDir = path.resolve(args[i + 1]);
      i += 1;
    } else if (args[i] === "--clear") {
      clear = true;
    }
  }

  return { years, dataDir, clear };
}

function loadCsvRows(filePath: string): CsvRow[] {
  const content = fs.readFileSync(filePath, "utf8");
  return parse(content, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true,
  }) as CsvRow[];
}

async function main() {
  const { years, dataDir, clear } = parseArgs();
  const files = (
    years.length > 0
      ? years.map((year) => path.join(dataDir, `${year}.csv`))
      : fs
          .readdirSync(dataDir)
          .filter((file) => /^\d{4}\.csv$/.test(file))
          .map((file) => path.join(dataDir, file))
  ).sort((a, b) => Number(path.basename(a, ".csv")) - Number(path.basename(b, ".csv")));

  console.log(`Importing ${files.length} file(s) from ${dataDir}`);
  console.log(`JK threshold: ${DEFAULT_JK_THRESHOLD} (0 = no jockey filter)`);

  const csvRows: Array<{ row: CsvRow; year: number }> = [];

  for (const file of files) {
    if (!fs.existsSync(file)) {
      console.warn(`Skipping missing file: ${file}`);
      continue;
    }

    const year = Number(path.basename(file, ".csv"));
    console.log(`Reading ${path.basename(file)}...`);
    const rows = loadCsvRows(file);
    for (const row of rows) {
      csvRows.push({ row, year });
    }
    console.log(`  ${rows.length.toLocaleString()} rows (${csvRows.length.toLocaleString()} total)`);
  }

  console.log("Running backtest engine (spec-compliant)...");
  const dataset = buildBacktestDataset(csvRows, DEFAULT_JK_THRESHOLD);

  const allTime = summarizeBacktest(dataset);
  const from2021 = summarizeBacktest(dataset, 2021, 2026);

  console.log("\nBacktest validation:");
  console.log(
    `  All-time qualifying picks: ${allTime.qualifyingPicks} | WR ${allTime.winRate.toFixed(1)}% | ROI ${allTime.roi.toFixed(1)}%`
  );
  console.log(
    `  2021-2026 qualifying picks: ${from2021.qualifyingPicks} | WR ${from2021.winRate.toFixed(1)}% | ROI ${from2021.roi.toFixed(1)}% | P&L £${from2021.totalPnl.toLocaleString()}`
  );
  console.log("  Expected (No JK filter, 2021+): 90 picks, 60.0% WR, +23.5% ROI, +£21,136");

  if (clear) {
    console.log("\nClearing historical_races table...");
    await prisma.historicalRace.deleteMany();
  }

  let processed = 0;
  let qualifiedCount = 0;
  const chunkSize = 2000;
  let chunk: Array<{
    raceExternalId: string;
    raceDate: Date;
    course: string;
    raceName: string;
    horseName: string;
    jockey: string;
    trainer: string;
    finishPos: number | null;
    officialRating: number | null;
    weightTotalLbs: number | null;
    distanceBand: string | null;
    spDecimal: number | null;
    fieldSize: number;
    isHandicap: boolean;
    isTurf: boolean;
    year: number;
    qualified: boolean;
    won: boolean;
    placed: boolean;
    pnl: number | null;
    failedRule: string | null;
  }> = [];

  async function flushChunk() {
    if (chunk.length === 0) return;
    await prisma.historicalRace.createMany({ data: chunk });
    processed += chunk.length;
    console.log(`Inserted ${processed.toLocaleString()} / ${dataset.length.toLocaleString()}`);
    chunk = [];
  }

  for (const row of dataset) {
    if (row.qualifies) qualifiedCount += 1;

    chunk.push({
      raceExternalId: row.id,
      raceDate: row.raceDate,
      course: row.course,
      raceName: row.raceName,
      horseName: row.horseName,
      jockey: row.jockey,
      trainer: row.trainer,
      finishPos: row.finishPos,
      officialRating: row.officialRating,
      weightTotalLbs: row.weightTotalLbs,
      distanceBand: row.distanceBand,
      spDecimal: row.spDecimal,
      fieldSize: row.fieldSize,
      isHandicap: row.isHandicap,
      isTurf: row.isTurf,
      year: row.year,
      qualified: row.qualifies,
      won: row.won,
      placed: row.placed,
      pnl: row.pnl,
      failedRule: row.failedRule,
    });

    if (chunk.length >= chunkSize) {
      await flushChunk();
    }
  }

  await flushChunk();

  console.log(
    `\nImport complete: ${processed.toLocaleString()} rows, ${qualifiedCount.toLocaleString()} qualifying bets`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

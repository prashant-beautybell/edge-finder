import "dotenv/config";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";
import { buildBacktestDataset } from "../src/lib/backtest-engine";
import type { CsvRow } from "../src/lib/csv-utils";

const dir =
  process.env.HISTORICAL_DATA_DIR ??
  "/Users/prashanttripathi/Downloads/RacingFormBookDatabase/RacingFormBook_exported";

const csvRows: Array<{ row: CsvRow; year: number }> = [];
for (let year = 2016; year <= 2026; year++) {
  const rows = parse(fs.readFileSync(path.join(dir, `${year}.csv`), "utf8"), {
    columns: true,
    skip_empty_lines: true,
  }) as CsvRow[];
  for (const row of rows) csvRows.push({ row, year });
}

const rows = buildBacktestDataset(csvRows, 0);

function count(label: string, pred: (r: (typeof rows)[0]) => boolean) {
  const n = rows.filter(pred).length;
  console.log(`${label}: ${n}`);
}

count("R1 turf handicap", (r) => r.isHandicap && r.isTurf);
count("R2 field 6-12", (r) => r.isHandicap && r.isTurf && r.fieldSize >= 6 && r.fieldSize <= 12);
count(
  "R3 LTO 1st/2nd",
  (r) =>
    r.isHandicap &&
    r.isTurf &&
    r.fieldSize >= 6 &&
    r.fieldSize <= 12 &&
    (r.prevFinishPos === 1 || r.prevFinishPos === 2)
);
count(
  "R4 top rated LTO",
  (r) =>
    r.isHandicap &&
    r.isTurf &&
    r.fieldSize >= 6 &&
    r.fieldSize <= 12 &&
    (r.prevFinishPos === 1 || r.prevFinishPos === 2) &&
    r.prevWasTopRated
);
count("qualified all", (r) => r.qualifies);
count("qualified 2021+", (r) => r.qualifies && r.year >= 2021);

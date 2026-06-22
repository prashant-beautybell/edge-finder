import {
  DEFAULT_JK_THRESHOLD,
  DEFAULT_STAKE,
  MAX_FIELD_SIZE,
  MIN_FIELD_SIZE,
  MIN_WEIGHT_LBS,
  SP_CAP,
  TARGET_DISTANCES,
} from "@/lib/config";
import type { CsvRow } from "@/lib/csv-utils";
import {
  distBandFromYards,
  isAllWeatherGoing,
  isHandicapRace,
  parseFinishPosition,
  parseRaceDate,
  parseSpDecimal,
  parseWeightLbs,
} from "@/lib/csv-utils";

export interface BacktestRow {
  id: string;
  originalIndex: number;
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
  won: boolean;
  placed: boolean;
  prevFinishPos: number | null;
  prevOr: number | null;
  prevDistBand: string | null;
  prevRaceId: string | null;
  prevWasTopRated: boolean;
  jockeySrPct: number | null;
  jockeyRides: number | null;
  isFavourite: boolean;
  qualifies: boolean;
  failedRule: string | null;
  pnl: number | null;
}

export interface BacktestSummary {
  totalRows: number;
  qualifyingPicks: number;
  winners: number;
  placed: number;
  totalPnl: number;
  winRate: number;
  placedRate: number;
  roi: number;
}

export interface AlgorithmRunner {
  horseName: string;
  jockey: string;
  officialRating: number | null;
  weightTotalLbs: number | null;
  spDecimal: number | null;
  distanceBand: string | null;
  isFavourite: boolean;
  ltoFinishPos: number | null;
  ltoWasTopRated: boolean | null;
  ltoDistanceBand: string | null;
  jockeySrPct: number | null;
  jockeyRides: number | null;
}

export interface AlgorithmRace {
  isHandicap: boolean;
  isTurf: boolean;
  fieldSize: number;
}

export interface AlgorithmResult {
  qualifies: boolean;
  failedRule: string | null;
  allRulesPassed: Record<string, boolean>;
}

function parseBaseRow(row: CsvRow, fileYear: number, originalIndex: number): BacktestRow | null {
  const raceDate = parseRaceDate(row.RaceDate);
  if (!raceDate) return null;

  const fieldSize = Number(row.Ran);
  const finishPos = parseFinishPosition(row.FPos);
  const yards = Number(row.Yards);
  const going = row.Going ?? "";
  const isAw = isAllWeatherGoing(going);
  const isHandicap = isHandicapRace(row.Race);
  const spDecimal = parseSpDecimal(row.Sp);
  const weightTotalLbs = parseWeightLbs(row.Stone, row.Lbs, row.WeightLBS);
  const year = fileYear || raceDate.getUTCFullYear();

  return {
    id: String(row.Id),
    originalIndex,
    raceDate,
    course: row.Course,
    raceName: row.Race,
    horseName: row.HorseName,
    jockey: row.Jockey ?? "",
    trainer: row.Trainer ?? "",
    finishPos,
    officialRating: row.OR ? Number(row.OR) : null,
    weightTotalLbs,
    distanceBand: distBandFromYards(yards),
    spDecimal,
    fieldSize: Number.isFinite(fieldSize) ? fieldSize : 0,
    isHandicap,
    isTurf: !isAw,
    year,
    won: finishPos === 1,
    placed: finishPos !== null && finishPos <= 3,
    prevFinishPos: null,
    prevOr: null,
    prevDistBand: null,
    prevRaceId: null,
    prevWasTopRated: false,
    jockeySrPct: null,
    jockeyRides: null,
    isFavourite: false,
    qualifies: false,
    failedRule: null,
    pnl: null,
  };
}

function buildRaceMaxOr(rows: BacktestRow[]): Map<string, number> {
  const raceMaxOr = new Map<string, number>();
  for (const row of rows) {
    if (row.officialRating === null || Number.isNaN(row.officialRating)) continue;
    const current = raceMaxOr.get(row.id);
    if (current === undefined || row.officialRating > current) {
      raceMaxOr.set(row.id, row.officialRating);
    }
  }
  return raceMaxOr;
}

function applyLtoFields(rows: BacktestRow[], raceMaxOr: Map<string, number>) {
  const byHorse = new Map<string, BacktestRow[]>();
  for (const row of rows) {
    const list = byHorse.get(row.horseName) ?? [];
    list.push(row);
    byHorse.set(row.horseName, list);
  }

  for (const horseRows of Array.from(byHorse.values())) {
    horseRows.sort(
      (a, b) =>
        a.raceDate.getTime() - b.raceDate.getTime() ||
        a.originalIndex - b.originalIndex
    );

    for (let i = 1; i < horseRows.length; i += 1) {
      const current = horseRows[i];
      const previous = horseRows[i - 1];
      current.prevFinishPos = previous.finishPos;
      current.prevOr = previous.officialRating;
      current.prevDistBand = previous.distanceBand;
      current.prevRaceId = previous.id;

      const prevRaceMaxOr =
        previous.id !== null ? raceMaxOr.get(previous.id) ?? null : null;
      current.prevWasTopRated =
        current.prevOr !== null &&
        prevRaceMaxOr !== null &&
        current.prevOr >= prevRaceMaxOr;
    }
  }
}

function applyJockeyStats(rows: BacktestRow[]) {
  const stats = new Map<string, { wins: number; rides: number }>();

  for (const row of rows) {
    if (!row.isHandicap || !row.isTurf || !row.jockey) continue;
    const key = `${row.year}|${row.jockey}`;
    const current = stats.get(key) ?? { wins: 0, rides: 0 };
    current.rides += 1;
    if (row.won) current.wins += 1;
    stats.set(key, current);
  }

  for (const row of rows) {
    const key = `${row.year}|${row.jockey}`;
    const data = stats.get(key);
    if (!data || data.rides < 10) continue;
    row.jockeySrPct = (data.wins / data.rides) * 100;
    row.jockeyRides = data.rides;
  }
}

function applyFavourites(rows: BacktestRow[]) {
  const byRace = new Map<string, BacktestRow[]>();
  for (const row of rows) {
    const list = byRace.get(row.id) ?? [];
    list.push(row);
    byRace.set(row.id, list);
  }

  for (const raceRows of Array.from(byRace.values())) {
    const ranked = [...raceRows].sort((a, b) => {
      const aSp = a.spDecimal ?? Number.POSITIVE_INFINITY;
      const bSp = b.spDecimal ?? Number.POSITIVE_INFINITY;
      if (aSp !== bSp) return aSp - bSp;
      return a.originalIndex - b.originalIndex;
    });

    if (ranked[0]?.spDecimal !== null && ranked[0]?.spDecimal !== undefined) {
      ranked[0].isFavourite = true;
    }
  }
}

export function applyAlgorithm(
  race: AlgorithmRace,
  runner: AlgorithmRunner,
  jkThreshold: number = DEFAULT_JK_THRESHOLD
): AlgorithmResult {
  const rules: Record<string, boolean> = {};

  rules.R1_turf_handicap = race.isHandicap && race.isTurf;
  rules.R2_field_size =
    race.fieldSize >= MIN_FIELD_SIZE && race.fieldSize <= MAX_FIELD_SIZE;
  rules.R3_placed_lto =
    runner.ltoFinishPos === 1 || runner.ltoFinishPos === 2;
  rules.R4_top_rated_lto = runner.ltoWasTopRated === true;
  rules.R5_weight =
    runner.weightTotalLbs !== null && runner.weightTotalLbs >= MIN_WEIGHT_LBS;
  rules.R6_favourite = runner.isFavourite;
  rules.R7_distance =
    runner.distanceBand !== null &&
    TARGET_DISTANCES.includes(runner.distanceBand);
  rules.R8_jockey_sr =
    jkThreshold === 0
      ? true
      : runner.jockeySrPct !== null && runner.jockeySrPct >= jkThreshold;
  rules.R9_same_distance =
    runner.distanceBand !== null &&
    runner.ltoDistanceBand !== null &&
    runner.distanceBand === runner.ltoDistanceBand;
  rules.SP_cap = runner.spDecimal !== null && runner.spDecimal <= SP_CAP;

  const failedRule = Object.entries(rules).find(([, passed]) => !passed)?.[0] ?? null;

  return {
    qualifies: failedRule === null,
    failedRule,
    allRulesPassed: rules,
  };
}

export function calculatePnl(
  won: boolean,
  spDecimal: number | null,
  stake: number = DEFAULT_STAKE
): number {
  if (won && spDecimal !== null) {
    return (spDecimal - 1) * stake;
  }
  return -stake;
}

function applyQualifyingFlags(rows: BacktestRow[], jkThreshold: number) {
  for (const row of rows) {
    const result = applyAlgorithm(
      {
        isHandicap: row.isHandicap,
        isTurf: row.isTurf,
        fieldSize: row.fieldSize,
      },
      {
        horseName: row.horseName,
        jockey: row.jockey,
        officialRating: row.officialRating,
        weightTotalLbs: row.weightTotalLbs,
        spDecimal: row.spDecimal,
        distanceBand: row.distanceBand,
        isFavourite: row.isFavourite,
        ltoFinishPos: row.prevFinishPos,
        ltoWasTopRated: row.prevWasTopRated,
        ltoDistanceBand: row.prevDistBand,
        jockeySrPct: row.jockeySrPct,
        jockeyRides: row.jockeyRides,
      },
      jkThreshold
    );

    row.qualifies = result.qualifies;
    row.failedRule = result.failedRule;
    row.pnl = result.qualifies
      ? calculatePnl(row.won, row.spDecimal, DEFAULT_STAKE)
      : null;
  }
}

export function buildBacktestDataset(
  csvRows: Array<{ row: CsvRow; year: number }>,
  jkThreshold: number = DEFAULT_JK_THRESHOLD
): BacktestRow[] {
  const rows: BacktestRow[] = [];
  csvRows.forEach(({ row, year }, originalIndex) => {
    const parsed = parseBaseRow(row, year, originalIndex);
    if (parsed) rows.push(parsed);
  });

  rows.sort(
    (a, b) =>
      a.horseName.localeCompare(b.horseName) ||
      a.raceDate.getTime() - b.raceDate.getTime() ||
      a.originalIndex - b.originalIndex
  );

  const raceMaxOr = buildRaceMaxOr(rows);
  applyLtoFields(rows, raceMaxOr);
  applyJockeyStats(rows);
  applyFavourites(rows);
  applyQualifyingFlags(rows, jkThreshold);

  return rows;
}

export function summarizeBacktest(
  rows: BacktestRow[],
  fromYear?: number,
  toYear?: number
): BacktestSummary {
  const qualified = rows.filter((row) => {
    if (!row.qualifies) return false;
    if (fromYear !== undefined && row.year < fromYear) return false;
    if (toYear !== undefined && row.year > toYear) return false;
    return true;
  });

  const totalPnl = qualified.reduce((sum, row) => sum + (row.pnl ?? 0), 0);
  const winners = qualified.filter((row) => row.won).length;
  const placed = qualified.filter((row) => row.placed).length;
  const n = qualified.length;

  return {
    totalRows: rows.length,
    qualifyingPicks: n,
    winners,
    placed,
    totalPnl,
    winRate: n > 0 ? (winners / n) * 100 : 0,
    placedRate: n > 0 ? (placed / n) * 100 : 0,
    roi: n > 0 ? (totalPnl / (n * DEFAULT_STAKE)) * 100 : 0,
  };
}

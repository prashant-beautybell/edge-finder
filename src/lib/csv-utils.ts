/**
 * CSV parsing helpers aligned with Handicap_Algorithm_Full_Spec.docx
 */

export interface CsvRow {
  Id: string;
  Course: string;
  RaceDate: string;
  RaceTime: string;
  Race: string;
  Type: string;
  Ran: string;
  Distance: string;
  Yards: string;
  Going: string;
  FPos: string;
  HorseName: string;
  Draw: string;
  Sp: string;
  Stone: string;
  Lbs: string;
  WeightLBS: string;
  Favs: string;
  Aid: string;
  Trainer: string;
  Jockey: string;
  OR: string;
}

/** CSV Sp is fractional SP minus 1. Add 1 for true decimal (evens=1.0 → 2.0). */
export function parseSpDecimal(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "") return null;
  const numeric = Number(String(raw).trim());
  if (Number.isNaN(numeric)) return null;
  return numeric + 1;
}

/** Distance bands from yards per spec section 4.1 */
export function distBandFromYards(yards: number | null | undefined): string | null {
  if (yards === null || yards === undefined || Number.isNaN(yards)) return null;
  const furlongs = yards / 220;
  if (furlongs > 5.5 && furlongs <= 6.5) return "6f";
  if (furlongs > 6.5 && furlongs <= 7.5) return "7f";
  if (furlongs > 7.5 && furlongs <= 8.5) return "1m";
  return null;
}

export function parseRaceDate(raw: string): Date | null {
  const match = raw.match(/(\d{2})\/(\d{2})\/(\d{2,4})/);
  if (!match) return null;

  const month = Number(match[1]);
  const day = Number(match[2]);
  let year = Number(match[3]);
  if (year < 100) year += 2000;

  if (month < 1 || month > 12 || day < 1 || day > 31) return null;

  return new Date(Date.UTC(year, month - 1, day));
}

export function isAllWeatherGoing(going: string): boolean {
  return /AW|Polytrack|Tapeta|Fibresand|Standard/i.test(going);
}

export function isHandicapRace(raceName: string): boolean {
  return /handicap|nursery/i.test(raceName);
}

export function parseFinishPosition(raw: string): number | null {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function parseWeightLbs(
  stoneRaw: string,
  lbsRaw: string,
  weightLbsFallback?: string
): number | null {
  const stone = Number(stoneRaw);
  const lbs = Number(lbsRaw);
  if (Number.isFinite(stone) && Number.isFinite(lbs)) {
    return stone * 14 + lbs;
  }
  if (weightLbsFallback) {
    const fallback = Number(weightLbsFallback);
    if (Number.isFinite(fallback)) return fallback;
  }
  return null;
}

export const RULE_LABELS: Record<string, string> = {
  R1_turf_handicap: "R1: Turf handicap",
  R2_field_size: "R2: Field size 6–12",
  R3_placed_lto: "R3: Placed 1st/2nd LTO",
  R4_top_rated_lto: "R4: Top-rated LTO",
  R5_weight: "R5: Weight ≥ 122 lbs",
  R6_favourite: "R6: Morning favourite",
  R7_distance: "R7: Distance 6f / 7f / 1m",
  R8_jockey_sr: "R8: Jockey strike rate",
  R9_same_distance: "R9: Same distance LTO",
  SP_cap: "SP cap ≤ 2.50",
};

export function formatFailedRule(rule: string | null): string {
  if (!rule) return "All rules passed";
  return RULE_LABELS[rule] ?? rule;
}

export interface EdgePickDto {
  raceId: string;
  course: string;
  raceTime: string;
  raceName: string | null;
  distanceBand: string | null;
  structuralCandidate: boolean;
  evaluated: boolean;
  qualifies: boolean;
  horseName: string | null;
  jockey: string | null;
  morningSp: number | null;
  failedRule: string | null;
  failedRuleLabel: string;
  runnerId: number | null;
}

import {
  DEFAULT_JK_THRESHOLD,
  DEFAULT_STAKE,
  MAX_FIELD_SIZE,
  MIN_FIELD_SIZE,
  MIN_WEIGHT_LBS,
  SP_CAP,
  TARGET_DISTANCES,
} from "@/lib/config";
import type { SportId } from "@/lib/sports";

export interface RacingAlgorithmRules {
  jkThreshold: number;
  stake: number;
  spCap: number;
  minWeightLbs: number;
  minFieldSize: number;
  maxFieldSize: number;
  targetDistances: string[];
  rulesDescription: string;
  format?: "json" | "worksheet";
  worksheet?: string;
}

export interface FootballAlgorithmRules {
  stake: number;
  homeMaxPrice: number;
  minMatchedVolume: number;
  rulesDescription: string;
  format?: "json" | "worksheet";
  worksheet?: string;
}

export type SportAlgorithmRules = RacingAlgorithmRules | FootballAlgorithmRules;

export interface AlgorithmRulesHistoryEntry {
  id: string;
  replacedAt: string;
  description: string | null;
  rules: SportAlgorithmRules;
}

export const DEFAULT_RACING_RULES: RacingAlgorithmRules = {
  jkThreshold: DEFAULT_JK_THRESHOLD,
  stake: DEFAULT_STAKE,
  spCap: SP_CAP,
  minWeightLbs: MIN_WEIGHT_LBS,
  minFieldSize: MIN_FIELD_SIZE,
  maxFieldSize: MAX_FIELD_SIZE,
  targetDistances: TARGET_DISTANCES,
  rulesDescription:
    "UK flat turf handicaps 6f–1m. Morning favourite must pass 9 rules including jockey SR, LTO form, OR, weight, and SP cap.",
};

export const DEFAULT_FOOTBALL_RULES: FootballAlgorithmRules = {
  stake: DEFAULT_STAKE,
  homeMaxPrice: 2.5,
  minMatchedVolume: 0,
  rulesDescription:
    "Betfair Match Odds. Home team back price at or below max price qualifies as a strong edge.",
};

export function defaultsForSport(sport: SportId): SportAlgorithmRules {
  return sport === "football" ? DEFAULT_FOOTBALL_RULES : DEFAULT_RACING_RULES;
}

export function mergeWithDefaults(
  parsed: Partial<SportAlgorithmRules>,
  sport: SportId
): SportAlgorithmRules {
  const defaults = defaultsForSport(sport);
  return { ...defaults, ...parsed };
}

export function parseRulesJson(json: string, sport: SportId): SportAlgorithmRules {
  try {
    const parsed = JSON.parse(json) as SportAlgorithmRules;
    return mergeWithDefaults(parsed, sport);
  } catch {
    return defaultsForSport(sport);
  }
}

/** Convert stored rules to text shown in the editor. */
export function rulesToEditorText(rules: SportAlgorithmRules): string {
  if (rules.format === "worksheet" && rules.worksheet) {
    return rules.worksheet;
  }
  const copy = { ...rules } as Record<string, unknown>;
  delete copy.format;
  delete copy.worksheet;
  return JSON.stringify(copy, null, 2);
}

/** Parse editor textarea — valid JSON or free-form worksheet text. */
export function parseRulesEditorInput(
  text: string,
  description: string,
  sport: SportId
): SportAlgorithmRules {
  const trimmed = text.trim();
  if (!trimmed) {
    const defaults = defaultsForSport(sport);
    return { ...defaults, rulesDescription: description || defaults.rulesDescription };
  }

  try {
    const parsed = JSON.parse(trimmed) as SportAlgorithmRules;
    const merged = mergeWithDefaults(parsed, sport);
    if (description) merged.rulesDescription = description;
    return merged;
  } catch {
    const defaults = defaultsForSport(sport);
    return {
      ...defaults,
      rulesDescription: description || defaults.rulesDescription,
      format: "worksheet",
      worksheet: text,
    };
  }
}

export function rulesDescriptionText(rules: SportAlgorithmRules): string | null {
  const desc = (rules as { rulesDescription?: string }).rulesDescription;
  return desc?.trim() ? desc.trim() : null;
}

export function historyDescriptionLabel(
  rules: SportAlgorithmRules,
  storedJson?: string
): string | null {
  const desc = rulesDescriptionText(rules);
  if (desc) return desc;
  if (rules.format === "worksheet") return "Worksheet rules";
  if (storedJson?.trim()) return "JSON rules";
  return null;
}

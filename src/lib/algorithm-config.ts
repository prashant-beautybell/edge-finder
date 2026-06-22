import { getFootballPrisma, getRacingPrisma } from "@/lib/db-sport";
import {
  DEFAULT_FOOTBALL_RULES,
  defaultsForSport,
  historyDescriptionLabel,
  parseRulesJson,
  type AlgorithmRulesHistoryEntry,
  type FootballAlgorithmRules,
  type RacingAlgorithmRules,
  type SportAlgorithmRules,
} from "@/lib/algorithm-rules";
import type { SportId } from "@/lib/sports";

export type {
  AlgorithmRulesHistoryEntry,
  FootballAlgorithmRules,
  RacingAlgorithmRules,
  SportAlgorithmRules,
} from "@/lib/algorithm-rules";

export {
  DEFAULT_FOOTBALL_RULES,
  DEFAULT_RACING_RULES,
  parseRulesEditorInput,
  rulesToEditorText,
} from "@/lib/algorithm-rules";

function prismaForSport(sport: SportId) {
  return sport === "football" ? getFootballPrisma() : getRacingPrisma();
}

function isMissingTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("does not exist") ||
    message.includes("P2021") ||
    message.includes("algorithmConfigHistory")
  );
}

export async function getAlgorithmRules(sport: SportId): Promise<SportAlgorithmRules> {
  const db = prismaForSport(sport);
  try {
    const row = await db.algorithmConfig.findUnique({ where: { id: "default" } });
    if (!row?.rulesJson) return defaultsForSport(sport);
    return parseRulesJson(row.rulesJson, sport);
  } catch (error) {
    if (isMissingTableError(error)) return defaultsForSport(sport);
    throw error;
  }
}

export async function listAlgorithmRulesHistory(
  sport: SportId,
  limit = 50
): Promise<AlgorithmRulesHistoryEntry[]> {
  const db = prismaForSport(sport);
  if (!db.algorithmConfigHistory) return [];

  try {
    const rows = await db.algorithmConfigHistory.findMany({
      orderBy: { replacedAt: "desc" },
      take: limit,
    });
    return rows.map((row) => ({
      id: row.id,
      replacedAt: row.replacedAt.toISOString(),
      description: row.description,
      rules: parseRulesJson(row.rulesJson, sport),
    }));
  } catch (error) {
    if (isMissingTableError(error)) return [];
    throw error;
  }
}

async function archiveCurrentRules(sport: SportId): Promise<void> {
  const db = prismaForSport(sport);
  if (!db.algorithmConfigHistory) return;

  const current = await db.algorithmConfig.findUnique({ where: { id: "default" } });
  if (!current?.rulesJson) return;

  const currentRules = parseRulesJson(current.rulesJson, sport);
  await db.algorithmConfigHistory.create({
    data: {
      rulesJson: current.rulesJson,
      description: historyDescriptionLabel(currentRules, current.rulesJson),
    },
  });
}

export async function saveAlgorithmRules(
  sport: SportId,
  rules: SportAlgorithmRules
): Promise<SportAlgorithmRules> {
  const db = prismaForSport(sport);
  const serialized = JSON.stringify(rules, null, 2);

  const existing = await db.algorithmConfig.findUnique({ where: { id: "default" } });
  if (existing?.rulesJson && existing.rulesJson !== serialized) {
    try {
      await archiveCurrentRules(sport);
    } catch (error) {
      if (!isMissingTableError(error)) throw error;
      console.warn(`[algorithm:${sport}] Could not archive previous rules:`, error);
    }
  }

  await db.algorithmConfig.upsert({
    where: { id: "default" },
    create: { id: "default", rulesJson: serialized },
    update: { rulesJson: serialized },
  });
  return rules;
}

export async function restoreAlgorithmRulesFromHistory(
  sport: SportId,
  historyId: string
): Promise<SportAlgorithmRules> {
  const db = prismaForSport(sport);
  const entry = await db.algorithmConfigHistory.findUnique({ where: { id: historyId } });
  if (!entry) throw new Error("History entry not found");

  const rules = parseRulesJson(entry.rulesJson, sport);
  await saveAlgorithmRules(sport, rules);
  return rules;
}

export async function getRacingRules(): Promise<RacingAlgorithmRules> {
  const rules = await getAlgorithmRules("racing");
  return rules as RacingAlgorithmRules;
}

export async function getFootballRules(): Promise<FootballAlgorithmRules> {
  const rules = await getAlgorithmRules("football");
  const defaults = {
    ...DEFAULT_FOOTBALL_RULES,
    homeMaxPrice: Number(process.env.FOOTBALL_EDGE_MAX_PRICE ?? DEFAULT_FOOTBALL_RULES.homeMaxPrice),
  };
  return {
    stake: (rules as FootballAlgorithmRules).stake ?? defaults.stake,
    homeMaxPrice: (rules as FootballAlgorithmRules).homeMaxPrice ?? defaults.homeMaxPrice,
    minMatchedVolume:
      (rules as FootballAlgorithmRules).minMatchedVolume ?? defaults.minMatchedVolume,
    rulesDescription:
      (rules as FootballAlgorithmRules).rulesDescription ?? defaults.rulesDescription,
    format: (rules as FootballAlgorithmRules).format,
    worksheet: (rules as FootballAlgorithmRules).worksheet,
  };
}

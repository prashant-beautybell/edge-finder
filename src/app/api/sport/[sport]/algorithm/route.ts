import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_FOOTBALL_RULES,
  DEFAULT_RACING_RULES,
  getAlgorithmRules,
  listAlgorithmRulesHistory,
  restoreAlgorithmRulesFromHistory,
  saveAlgorithmRules,
  type SportAlgorithmRules,
} from "@/lib/algorithm-config";
import { isSportId } from "@/lib/sports";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { sport: string } }
) {
  if (!isSportId(params.sport)) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 404 });
  }

  try {
    const [rules, history] = await Promise.all([
      getAlgorithmRules(params.sport),
      listAlgorithmRulesHistory(params.sport),
    ]);
    const defaults =
      params.sport === "football" ? DEFAULT_FOOTBALL_RULES : DEFAULT_RACING_RULES;
    return NextResponse.json({ sport: params.sport, rules, defaults, history });
  } catch (error) {
    console.error(`Get algorithm ${params.sport}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to load rules" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { sport: string } }
) {
  if (!isSportId(params.sport)) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { rules?: SportAlgorithmRules };
    if (!body.rules) {
      return NextResponse.json({ error: "Missing rules object" }, { status: 400 });
    }
    const saved = await saveAlgorithmRules(params.sport, body.rules);
    const history = await listAlgorithmRulesHistory(params.sport);
    return NextResponse.json({ sport: params.sport, rules: saved, history });
  } catch (error) {
    console.error(`Save algorithm ${params.sport}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to save rules" },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: { sport: string } }
) {
  if (!isSportId(params.sport)) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { historyId?: string };
    if (!body.historyId) {
      return NextResponse.json({ error: "Missing historyId" }, { status: 400 });
    }
    const rules = await restoreAlgorithmRulesFromHistory(params.sport, body.historyId);
    const history = await listAlgorithmRulesHistory(params.sport);
    return NextResponse.json({ sport: params.sport, rules, history });
  } catch (error) {
    console.error(`Restore algorithm ${params.sport}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to restore rules" },
      { status: 500 }
    );
  }
}

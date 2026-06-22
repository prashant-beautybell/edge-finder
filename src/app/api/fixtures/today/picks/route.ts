import { NextRequest, NextResponse } from "next/server";
import { ensureTodayFootballFixturesSynced, listTodayFootballPicks, scanTodayFootballPicks } from "@/lib/live-football";
import { getDatabaseSetupError } from "@/lib/db-config";

export const dynamic = "force-dynamic";

function parseDateParam(value: string | null): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function GET(request: NextRequest) {
  const setupError = getDatabaseSetupError();
  if (setupError) {
    return NextResponse.json({ error: setupError }, { status: 503 });
  }

  try {
    const date = parseDateParam(request.nextUrl.searchParams.get("date"));
    await ensureTodayFootballFixturesSynced(date);
    const picks = await listTodayFootballPicks(date);
    const qualifying = picks.filter((p) => p.qualifies);

    return NextResponse.json({
      date: date.toISOString().slice(0, 10),
      count: picks.length,
      qualifyingCount: qualifying.length,
      picks,
      qualifying,
    });
  } catch (error) {
    console.error("List football picks error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list football picks" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const setupError = getDatabaseSetupError();
  if (setupError) {
    return NextResponse.json({ error: setupError }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const date = parseDateParam(body.date ?? null);
    const result = await scanTodayFootballPicks(date);

    return NextResponse.json({
      date: date.toISOString().slice(0, 10),
      scanned: result.scanned,
      qualifyingCount: result.qualifying,
      picks: result.picks,
      qualifying: result.picks.filter((p) => p.qualifies),
    });
  } catch (error) {
    console.error("Scan football picks error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to scan football picks" },
      { status: 500 }
    );
  }
}

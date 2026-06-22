import { NextRequest, NextResponse } from "next/server";
import { listTodayFootballFixtures, syncTodayFootballFixtures, ensureTodayFootballFixturesSynced } from "@/lib/live-football";
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
    const forceSync = request.nextUrl.searchParams.get("sync") === "1";

    if (forceSync) {
      await syncTodayFootballFixtures(date);
    } else {
      await ensureTodayFootballFixturesSynced(date);
    }

    const fixtures = await listTodayFootballFixtures(date);
    return NextResponse.json({
      date: date.toISOString().slice(0, 10),
      count: fixtures.length,
      fixtures,
    });
  } catch (error) {
    console.error("List today fixtures error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list fixtures" },
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
    const result = await syncTodayFootballFixtures(date);

    let edgeScan = null;
    if (body.scan !== false) {
      const { scanTodayFootballPicks } = await import("@/lib/live-football");
      edgeScan = await scanTodayFootballPicks(date);
    }

    return NextResponse.json({ ...result, edgeScan });
  } catch (error) {
    console.error("Sync today fixtures error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch today's football fixtures from Betfair",
      },
      { status: 500 }
    );
  }
}

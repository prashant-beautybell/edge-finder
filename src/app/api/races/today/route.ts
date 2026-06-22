import { NextRequest, NextResponse } from "next/server";
import { listTodayRaces, syncTodayMeetings } from "@/lib/live-races";
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
    const races = await listTodayRaces(date);
    return NextResponse.json({
      date: date.toISOString().slice(0, 10),
      count: races.length,
      races,
    });
  } catch (error) {
    console.error("List today races error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list races" },
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
    const result = await syncTodayMeetings(date);

    let edgeScan = null;
    if (body.scan !== false) {
      const { scanTodayEdgePicks } = await import("@/lib/live/edge-picks");
      edgeScan = await scanTodayEdgePicks(date);
      const { clearDashboardCache } = await import("@/lib/dashboard-cache");
      clearDashboardCache();
    }

    return NextResponse.json({ ...result, edgeScan });
  } catch (error) {
    console.error("Sync today meetings error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch today's racecards from Racing Post",
      },
      { status: 500 }
    );
  }
}

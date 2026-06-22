import { NextRequest, NextResponse } from "next/server";
import {
  listTodayEdgePicks,
  scanTodayEdgePicks,
} from "@/lib/live/edge-picks";
import { getDatabaseSetupError } from "@/lib/db-config";
import { clearDashboardCache } from "@/lib/dashboard-cache";

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
    const picks = await listTodayEdgePicks(date);
    const qualifying = picks.filter((p) => p.qualifies);

    return NextResponse.json({
      date: date.toISOString().slice(0, 10),
      count: picks.length,
      qualifyingCount: qualifying.length,
      picks,
      qualifying,
    });
  } catch (error) {
    console.error("List edge picks error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to list edge picks" },
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
    const result = await scanTodayEdgePicks(date);
    clearDashboardCache();

    return NextResponse.json({
      date: date.toISOString().slice(0, 10),
      scanned: result.scanned,
      structural: result.structural,
      qualifyingCount: result.qualifying,
      picks: result.picks,
      qualifying: result.picks.filter((p) => p.qualifies),
    });
  } catch (error) {
    console.error("Scan edge picks error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to scan edge picks" },
      { status: 500 }
    );
  }
}

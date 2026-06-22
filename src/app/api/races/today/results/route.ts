import { NextRequest, NextResponse } from "next/server";
import { syncPendingRaceResults } from "@/lib/live-races";
import { getDatabaseSetupError } from "@/lib/db-config";
import { clearDashboardCache } from "@/lib/dashboard-cache";

export const dynamic = "force-dynamic";

function parseDateParam(value: string | null): Date {
  if (!value) return new Date();
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export async function POST(request: NextRequest) {
  const setupError = getDatabaseSetupError();
  if (setupError) {
    return NextResponse.json({ error: setupError }, { status: 503 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const date = parseDateParam(body.date ?? null);
    const outcomes = await syncPendingRaceResults(date);
    const settled = outcomes.filter((o) => o.ok).length;

    if (settled > 0) clearDashboardCache();

    return NextResponse.json({
      date: date.toISOString().slice(0, 10),
      checked: outcomes.length,
      settled,
      outcomes,
    });
  } catch (error) {
    console.error("Sync pending results error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to sync results" },
      { status: 500 }
    );
  }
}

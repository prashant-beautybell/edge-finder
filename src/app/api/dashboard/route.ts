import { NextRequest, NextResponse } from "next/server";
import {
  getDatabaseLabel,
  getDatabaseSetupError,
  getPoolerErrorHint,
  isPoolerTimeoutError,
} from "@/lib/db-config";
import { getDashboardBundle } from "@/lib/dashboard-cache";

export const dynamic = "force-dynamic";

import { clearDashboardCache } from "@/lib/dashboard-cache";

export async function GET(request: NextRequest) {
  const setupError = getDatabaseSetupError();
  if (setupError) {
    return NextResponse.json(
      {
        error: setupError,
        code: "DATABASE_NOT_CONFIGURED",
        hint: "Use DATABASE_URL on port 5432 (not 6543). See .env.example.",
      },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;

    if (searchParams.get("refresh") === "1") {
      clearDashboardCache();
    }

    const bundle = await getDashboardBundle(from, to, getDatabaseLabel());

    return NextResponse.json({
      health: bundle.health,
      summary: bundle.summary,
      monthly: bundle.monthly,
      byDistance: bundle.byDistance,
      runningPnl: bundle.runningPnl,
      byYear: bundle.byYear,
      bets: bundle.bets,
    });
  } catch (error) {
    console.error("Dashboard API error:", error);
    const message = isPoolerTimeoutError(error)
      ? getPoolerErrorHint()
      : error instanceof Error
        ? error.message
        : "Failed to load dashboard from database.";
    return NextResponse.json({ error: message, code: "DATABASE_ERROR" }, { status: 500 });
  }
}

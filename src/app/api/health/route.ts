import { NextResponse } from "next/server";
import {
  getDatabaseLabel,
  getDatabaseSetupError,
  getPoolerErrorHint,
  isPoolerTimeoutError,
} from "@/lib/db-config";
import { getHealthSnapshot } from "@/lib/health-cache";

export const dynamic = "force-dynamic";

export async function GET() {
  const setupError = getDatabaseSetupError();
  if (setupError) {
    return NextResponse.json({ ok: false, error: setupError }, { status: 503 });
  }

  try {
    const snapshot = await getHealthSnapshot();

    return NextResponse.json({
      ok: true,
      totalRows: snapshot.totalRows,
      qualifiedRows: snapshot.qualifiedRows,
      latestRaceDate: snapshot.latestRaceDate,
      dataType: "historical_backtest",
      database: getDatabaseLabel(),
    });
  } catch (error) {
    console.error("Health check error:", error);
    const hint = isPoolerTimeoutError(error) ? getPoolerErrorHint() : "Database unavailable";
    return NextResponse.json({ ok: false, error: hint }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { ingestToday } from "@/lib/live/pipeline";
import { scanTodayEdgePicks } from "@/lib/live/edge-picks";
import { clearDashboardCache } from "@/lib/dashboard-cache";
import { getDatabaseSetupError } from "@/lib/db-config";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const setupError = getDatabaseSetupError();
  if (setupError) {
    return NextResponse.json({ error: setupError }, { status: 503 });
  }

  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const ingest = await ingestToday();
    const scan = await scanTodayEdgePicks();
    clearDashboardCache();

    return NextResponse.json({
      ingest: {
        scannedRaces: ingest.scannedRaces,
        structuralCandidates: ingest.structuralCandidates,
        qualifyingBets: ingest.qualifyingBets,
      },
      scan: {
        structural: scan.structural,
        qualifying: scan.qualifying,
      },
    });
  } catch (error) {
    console.error("Cron ingest error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Ingest failed" },
      { status: 500 }
    );
  }
}

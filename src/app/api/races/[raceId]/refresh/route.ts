import { NextResponse } from "next/server";
import { refreshRaceCard } from "@/lib/live-races";
import { getDatabaseSetupError } from "@/lib/db-config";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { raceId: string } }
) {
  const setupError = getDatabaseSetupError();
  if (setupError) {
    return NextResponse.json({ error: setupError }, { status: 503 });
  }

  try {
    const race = await refreshRaceCard(params.raceId);
    return NextResponse.json({ race });
  } catch (error) {
    console.error(`Refresh race ${params.raceId} error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to refresh race card" },
      { status: 500 }
    );
  }
}

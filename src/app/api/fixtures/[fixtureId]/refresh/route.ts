import { NextResponse } from "next/server";
import { refreshFootballFixture } from "@/lib/live-football";
import { getDatabaseSetupError } from "@/lib/db-config";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { fixtureId: string } }
) {
  const setupError = getDatabaseSetupError();
  if (setupError) {
    return NextResponse.json({ error: setupError }, { status: 503 });
  }

  try {
    const fixture = await refreshFootballFixture(params.fixtureId);
    return NextResponse.json({ fixture });
  } catch (error) {
    console.error(`Refresh fixture ${params.fixtureId} error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to refresh fixture" },
      { status: 500 }
    );
  }
}

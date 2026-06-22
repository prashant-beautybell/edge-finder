import { NextResponse } from "next/server";
import { syncFootballExchangeOdds } from "@/lib/live-football";
import { getBetfairSetupError } from "@/lib/betfair-config";
import { getDatabaseSetupError } from "@/lib/db-config";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  { params }: { params: { fixtureId: string } }
) {
  const dbError = getDatabaseSetupError();
  if (dbError) {
    return NextResponse.json({ error: dbError }, { status: 503 });
  }

  const betfairError = getBetfairSetupError();
  if (betfairError) {
    return NextResponse.json({ error: betfairError, code: "BETFAIR_NOT_CONFIGURED" }, { status: 503 });
  }

  try {
    const result = await syncFootballExchangeOdds(params.fixtureId);
    return NextResponse.json({
      fixture: result.fixture,
      exchangeMeta: result.exchangeMeta,
    });
  } catch (error) {
    console.error(`Football exchange sync ${params.fixtureId} error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Betfair prices" },
      { status: 500 }
    );
  }
}

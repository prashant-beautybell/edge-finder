import { NextResponse } from "next/server";
import { syncBetfairOdds } from "@/lib/live-races";
import { getBetfairSetupError } from "@/lib/betfair-config";
import { getDatabaseSetupError } from "@/lib/db-config";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: { raceId: string } }
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
    let marketIdOrUrl: string | undefined;
    try {
      const body = (await request.json()) as { marketIdOrUrl?: string };
      marketIdOrUrl = body.marketIdOrUrl;
    } catch {
      // empty body is fine — auto-match by course/time
    }

    const result = await syncBetfairOdds(params.raceId, { marketIdOrUrl });
    return NextResponse.json({
      race: result.race,
      exchangeMeta: result.exchangeMeta,
    });
  } catch (error) {
    console.error(`Betfair sync ${params.raceId} error:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch Betfair prices" },
      { status: 500 }
    );
  }
}

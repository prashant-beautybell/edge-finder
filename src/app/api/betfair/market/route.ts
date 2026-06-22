import { NextResponse } from "next/server";
import { fetchBetfairMarket } from "@/lib/live-races";
import { getBetfairSetupError } from "@/lib/betfair-config";
import { getDatabaseSetupError } from "@/lib/db-config";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const dbError = getDatabaseSetupError();
  if (dbError) {
    return NextResponse.json({ error: dbError }, { status: 503 });
  }

  const betfairError = getBetfairSetupError();
  if (betfairError) {
    return NextResponse.json(
      { error: betfairError, code: "BETFAIR_NOT_CONFIGURED" },
      { status: 503 }
    );
  }

  try {
    const body = (await request.json()) as { marketIdOrUrl?: string };
    if (!body.marketIdOrUrl?.trim()) {
      return NextResponse.json(
        { error: "Provide marketIdOrUrl — Betfair market URL or id (e.g. 1.259190153)" },
        { status: 400 }
      );
    }

    const market = await fetchBetfairMarket(body.marketIdOrUrl);
    return NextResponse.json({ market });
  } catch (error) {
    console.error("Betfair market fetch error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch market" },
      { status: 500 }
    );
  }
}

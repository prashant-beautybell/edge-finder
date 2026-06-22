import { NextRequest, NextResponse } from "next/server";
import { importFootballMarketFromBetfair } from "@/lib/live-football";
import { getDatabaseSetupError } from "@/lib/db-config";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const setupError = getDatabaseSetupError();
  if (setupError) {
    return NextResponse.json({ error: setupError }, { status: 503 });
  }

  try {
    const body = await request.json();
    const market = body.marketId ?? body.url ?? body.input;
    if (!market || typeof market !== "string") {
      return NextResponse.json(
        { error: "Provide marketId or Betfair football market URL" },
        { status: 400 }
      );
    }

    const fixture = await importFootballMarketFromBetfair(market);
    return NextResponse.json({ fixture });
  } catch (error) {
    console.error("Import football market error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to import market" },
      { status: 500 }
    );
  }
}

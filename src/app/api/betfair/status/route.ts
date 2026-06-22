import { NextResponse } from "next/server";
import { getBetfairSetupError } from "@/lib/betfair-config";
import { testBetfairConnection } from "@/lib/sources/betfair";

export const dynamic = "force-dynamic";

export async function GET() {
  const setupError = getBetfairSetupError();
  if (setupError) {
    return NextResponse.json({
      configured: false,
      connected: false,
      message: setupError,
    });
  }

  const result = await testBetfairConnection();
  return NextResponse.json({
    configured: true,
    connected: result.ok,
    message: result.message,
  });
}

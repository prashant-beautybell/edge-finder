import { NextRequest, NextResponse } from "next/server";
import { getSportHealth } from "@/lib/sport-health";
import { isSportId } from "@/lib/sports";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: { sport: string } }
) {
  if (!isSportId(params.sport)) {
    return NextResponse.json({ error: "Unknown sport" }, { status: 404 });
  }

  try {
    const health = await getSportHealth(params.sport);
    return NextResponse.json(health);
  } catch (error) {
    console.error(`Sport health ${params.sport}:`, error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Health check failed" },
      { status: 500 }
    );
  }
}

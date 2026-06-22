import { NextRequest, NextResponse } from "next/server";
import {
  getDashboardStats,
  getMonthlyStats,
  getRunningPnl,
  getStatsByDistance,
  getStatsByYear,
  getQualifyingBets,
} from "@/lib/stats";
import { getDatabaseSetupError, getPoolerErrorHint, isPoolerTimeoutError } from "@/lib/db-config";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const setupError = getDatabaseSetupError();
  if (setupError) {
    return NextResponse.json(
      {
        error: setupError,
        code: "DATABASE_NOT_CONFIGURED",
        hint: "Use DATABASE_URL on port 5432 (not 6543). See .env.example.",
      },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = request.nextUrl;
    const from = searchParams.get("from") ?? undefined;
    const to = searchParams.get("to") ?? undefined;
    const stake = searchParams.get("stake")
      ? Number(searchParams.get("stake"))
      : undefined;
    const include = searchParams.get("include") ?? "summary";

    const summary = await getDashboardStats({ from, to, stake });

    if (include === "summary") {
      return NextResponse.json(summary);
    }

    const monthly = await getMonthlyStats(from, to);
    const byDistance = await getStatsByDistance(from, to);
    const runningPnl = await getRunningPnl(from, to);
    const byYear = await getStatsByYear(from, to);
    const bets = await getQualifyingBets(from, to);

    return NextResponse.json({
      summary,
      monthly,
      byDistance,
      runningPnl,
      byYear,
      bets: bets.map((bet) => ({
        id: bet.id,
        date: bet.raceDate?.toISOString().slice(0, 10) ?? "",
        course: bet.course,
        horse: bet.horseName,
        jockey: bet.jockey,
        distance: bet.distanceBand,
        sp: bet.spDecimal ? Number(bet.spDecimal) : null,
        finishPos: bet.finishPos,
        won: bet.won,
        placed: bet.placed,
        pnl: bet.pnl ? Number(bet.pnl) : null,
        year: bet.year,
      })),
    });
  } catch (error) {
    console.error("Stats API error:", error);
    const message = isPoolerTimeoutError(error)
      ? getPoolerErrorHint()
      : error instanceof Error
        ? error.message
        : "Failed to fetch stats from Supabase.";
    return NextResponse.json({ error: message, code: "DATABASE_ERROR" }, { status: 500 });
  }
}

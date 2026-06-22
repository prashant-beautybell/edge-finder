"use client";

import { TodayFixturesPanel } from "@/components/TodayFixturesPanel";
import { useToday } from "@/components/dashboard/TodayContext";

export function TodayFootballFixturesView() {
  const { focusFixtureId, bumpEdgeRefresh } = useToday();

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-betfair-navy">Football Fixtures</h2>
        <p className="text-sm text-betfair-muted">
          Today&apos;s matches and live Betfair exchange prices
        </p>
      </div>

      <TodayFixturesPanel
        ready
        focusFixtureId={focusFixtureId}
        onScheduleLoaded={bumpEdgeRefresh}
      />
    </div>
  );
}

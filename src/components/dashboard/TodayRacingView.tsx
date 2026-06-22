"use client";

import { TodayRacesPanel } from "@/components/TodayRacesPanel";
import { useToday } from "@/components/dashboard/TodayContext";

export function TodayRacingView() {
  const { focusRaceId, bumpEdgeRefresh } = useToday();

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-betfair-navy">Racing</h2>
        <p className="text-sm text-betfair-muted">
          Schedule, race cards, Betfair exchange, and live prices
        </p>
      </div>

      <TodayRacesPanel
        ready
        focusRaceId={focusRaceId}
        onScheduleLoaded={bumpEdgeRefresh}
      />
    </div>
  );
}

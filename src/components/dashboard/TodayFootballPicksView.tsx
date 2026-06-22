"use client";

import { useRouter } from "next/navigation";
import { TodaysFootballPicks } from "@/components/TodaysFootballPicks";
import { useToday } from "@/components/dashboard/TodayContext";

export function TodayFootballPicksView() {
  const router = useRouter();
  const { edgeRefreshKey, setFocusFixtureId } = useToday();

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-betfair-navy">Football Edge Picks</h2>
        <p className="text-sm text-betfair-muted">
          Home-team value scan on Betfair Match Odds markets
        </p>
      </div>

      <TodaysFootballPicks
        ready
        refreshKey={edgeRefreshKey}
        onSelectFixture={(fixtureId) => {
          setFocusFixtureId(fixtureId);
          router.push("/dashboard/football/today/fixtures");
        }}
      />
    </div>
  );
}

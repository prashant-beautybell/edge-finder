"use client";

import { useRouter } from "next/navigation";
import { TodaysEdgePicks } from "@/components/TodaysEdgePicks";
import { useToday } from "@/components/dashboard/TodayContext";

export function TodayPicksView() {
  const router = useRouter();
  const { edgeRefreshKey, setFocusRaceId } = useToday();

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-betfair-navy">Edge Picks</h2>
        <p className="text-sm text-betfair-muted">
          9-rule scan results — strong edges are saved to the database
        </p>
      </div>

      <TodaysEdgePicks
        ready
        refreshKey={edgeRefreshKey}
        onSelectRace={(raceId) => {
          setFocusRaceId(raceId);
          router.push("/dashboard/racing/today/racing");
        }}
      />
    </div>
  );
}

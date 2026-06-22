"use client";

import { useCallback, useEffect, useState } from "react";
import { DashboardHeader } from "@/components/DashboardHeader";
import { DashboardNav } from "@/components/dashboard/DashboardNav";
import { SPORT_META, type SportId } from "@/lib/sports";

interface HealthStatus {
  ok: boolean;
  totalRows?: number;
  qualifiedRows?: number;
  database?: string;
}

export function DashboardShell({
  sport,
  children,
}: {
  sport: SportId;
  children: React.ReactNode;
}) {
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const meta = SPORT_META[sport];

  const loadHealth = useCallback(
    async (refresh = false) => {
      setRefreshing(true);
      try {
        const params = refresh ? "?refresh=1" : "";
        const res = await fetch(`/api/sport/${sport}/health${params}`);
        const json = await res.json();
        if (res.ok) setHealth(json as HealthStatus);
      } catch {
        // Header still renders without stats.
      } finally {
        setRefreshing(false);
      }
    },
    [sport]
  );

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  return (
    <div className="min-h-screen bg-betfair-surface">
      <DashboardHeader
        sport={sport}
        onRefresh={() => void loadHealth(true)}
        refreshing={refreshing}
        qualifiedRows={health?.qualifiedRows}
        totalRows={health?.totalRows}
        databaseLabel={health?.database ?? meta.dbLabel}
      />
      <DashboardNav sport={sport} />
      {children}
    </div>
  );
}

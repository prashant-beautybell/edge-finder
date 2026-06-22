"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface TodayContextValue {
  edgeRefreshKey: number;
  focusRaceId: string | null;
  focusFixtureId: string | null;
  bumpEdgeRefresh: () => void;
  setFocusRaceId: (raceId: string | null) => void;
  setFocusFixtureId: (fixtureId: string | null) => void;
}

const TodayContext = createContext<TodayContextValue | null>(null);

export function TodayProvider({ children }: { children: React.ReactNode }) {
  const [edgeRefreshKey, setEdgeRefreshKey] = useState(0);
  const [focusRaceId, setFocusRaceId] = useState<string | null>(null);
  const [focusFixtureId, setFocusFixtureId] = useState<string | null>(null);

  const bumpEdgeRefresh = useCallback(() => {
    setEdgeRefreshKey((k) => k + 1);
  }, []);

  return (
    <TodayContext.Provider
      value={{
        edgeRefreshKey,
        focusRaceId,
        focusFixtureId,
        bumpEdgeRefresh,
        setFocusRaceId,
        setFocusFixtureId,
      }}
    >
      {children}
    </TodayContext.Provider>
  );
}

export function useToday() {
  const ctx = useContext(TodayContext);
  if (!ctx) throw new Error("useToday must be used within TodayProvider");
  return ctx;
}

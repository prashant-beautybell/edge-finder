"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Goal, Sparkles } from "lucide-react";
import { Info } from "lucide-react";

export function TodayFootballHome() {
  const [fixtureCount, setFixtureCount] = useState<number | null>(null);
  const [edgeCount, setEdgeCount] = useState<number | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [fixturesRes, picksRes] = await Promise.all([
          fetch("/api/fixtures/today"),
          fetch("/api/fixtures/today/picks"),
        ]);
        const fixturesJson = await fixturesRes.json();
        const picksJson = await picksRes.json();
        if (fixturesRes.ok) setFixtureCount(fixturesJson.fixtures?.length ?? 0);
        if (picksRes.ok) setEdgeCount(picksJson.qualifyingCount ?? 0);
      } catch {
        // Glimpse still works without counts.
      }
    }
    void load();
  }, []);

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-betfair-navy">Today — Football</h2>
        <p className="text-sm text-betfair-muted">
          Match odds from Betfair — edge picks and live fixtures
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
        <div>
          <p className="font-semibold">How football data is saved</p>
          <p className="mt-0.5 text-blue-800/80">
            Import fixtures under <strong>Fixtures</strong> (from Betfair Match Odds). Edge scan
            runs automatically and saves strong home picks to the database.
          </p>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          href="/dashboard/football/today/picks"
          className="group flex flex-col justify-between rounded-lg border border-betfair-border bg-white p-5 shadow-sm transition-colors hover:border-betfair-yellow hover:bg-betfair-yellow/5"
        >
          <div>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-betfair-yellow/20">
              <Sparkles className="h-5 w-5 text-[#9a6700]" />
            </div>
            <h3 className="text-lg font-bold text-betfair-navy">Edge Picks</h3>
            <p className="mt-1 text-sm text-betfair-muted">
              Scan match odds and view home-team value picks saved to the database.
            </p>
            {edgeCount !== null ? (
              <p className="mt-3 text-sm font-semibold text-betfair-navy">
                {edgeCount} strong edge{edgeCount === 1 ? "" : "s"} today
              </p>
            ) : null}
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-betfair-navy group-hover:text-[#9a6700]">
            Open edge picks
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        <Link
          href="/dashboard/football/today/fixtures"
          className="group flex flex-col justify-between rounded-lg border border-betfair-border bg-white p-5 shadow-sm transition-colors hover:border-betfair-yellow hover:bg-betfair-yellow/5"
        >
          <div>
            <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-md bg-green-50">
              <Goal className="h-5 w-5 text-betfair-green" />
            </div>
            <h3 className="text-lg font-bold text-betfair-navy">Fixtures</h3>
            <p className="mt-1 text-sm text-betfair-muted">
              Today&apos;s matches, live Betfair prices, and match odds markets.
            </p>
            {fixtureCount !== null ? (
              <p className="mt-3 text-sm font-semibold text-betfair-navy">
                {fixtureCount} fixture{fixtureCount === 1 ? "" : "s"} loaded
              </p>
            ) : null}
          </div>
          <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-betfair-navy group-hover:text-betfair-green">
            Open fixtures
            <ArrowRight className="h-4 w-4" />
          </span>
        </Link>
      </div>
    </div>
  );
}

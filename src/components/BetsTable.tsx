"use client";

import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Download, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface BetRow {
  id: number;
  date: string;
  course: string | null;
  horse: string | null;
  jockey: string | null;
  distance: string | null;
  sp: number | null;
  finishPos: number | null;
  won: boolean | null;
  placed: boolean | null;
  pnl: number | null;
  year: number | null;
}

interface BetsTableProps {
  bets: BetRow[];
  loading?: boolean;
}

function formatCurrency(value: number) {
  const prefix = value >= 0 ? "+£" : "-£";
  return `${prefix}${Math.abs(value).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

function formatSp(sp: number | null) {
  if (sp === null) return "—";
  const fractional = sp - 1;
  if (Math.abs(fractional - 0.5) < 0.01) return "1/2";
  if (Math.abs(fractional - 1) < 0.01) return "Evens";
  if (Math.abs(fractional - 1.5) < 0.01) return "6/4";
  if (Math.abs(fractional - 2) < 0.01) return "3/1";
  return sp.toFixed(2);
}

function exportCsv(bets: BetRow[]) {
  const headers = ["Date", "Course", "Horse", "Jockey", "Distance", "SP", "Result", "P&L"];
  const rows = bets.map((b) => [
    b.date,
    b.course ?? "",
    b.horse ?? "",
    b.jockey ?? "",
    b.distance ?? "",
    b.sp?.toFixed(2) ?? "",
    b.won ? "Won" : b.placed ? "Placed" : "Lost",
    b.pnl?.toFixed(0) ?? "",
  ]);
  const csv = [headers, ...rows].map((r) => r.join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `qualifying-bets-${format(new Date(), "yyyy-MM-dd")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function BetsTable({ bets, loading }: BetsTableProps) {
  const [search, setSearch] = useState("");
  const [resultFilter, setResultFilter] = useState<"all" | "won" | "placed" | "lost">("all");

  const filtered = useMemo(() => {
    return bets.filter((bet) => {
      const q = search.toLowerCase();
      const matchesSearch =
        !q ||
        bet.horse?.toLowerCase().includes(q) ||
        bet.course?.toLowerCase().includes(q) ||
        bet.jockey?.toLowerCase().includes(q);

      const matchesResult =
        resultFilter === "all" ||
        (resultFilter === "won" && bet.won) ||
        (resultFilter === "placed" && bet.placed && !bet.won) ||
        (resultFilter === "lost" && !bet.won && !bet.placed);

      return matchesSearch && matchesResult;
    });
  }, [bets, search, resultFilter]);

  return (
    <div className="betfair-card overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-betfair-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-semibold text-betfair-navy">Qualifying Bets</h3>
          <p className="text-xs text-betfair-muted">
            {filtered.length} of {bets.length} bets · £1,000 flat stake
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-betfair-muted" />
            <input
              type="text"
              placeholder="Search horse, course, jockey…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-52 rounded-md border border-betfair-border bg-white pl-8 pr-3 text-xs text-betfair-navy placeholder:text-betfair-muted focus:border-betfair-yellow focus:outline-none focus:ring-1 focus:ring-betfair-yellow"
            />
          </div>
          <select
            value={resultFilter}
            onChange={(e) => setResultFilter(e.target.value as typeof resultFilter)}
            className="h-8 rounded-md border border-betfair-border bg-white px-2 text-xs text-betfair-navy focus:border-betfair-yellow focus:outline-none"
          >
            <option value="all">All results</option>
            <option value="won">Winners</option>
            <option value="placed">Placed only</option>
            <option value="lost">Lost</option>
          </select>
          <button
            type="button"
            onClick={() => exportCsv(filtered)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-betfair-border bg-white px-3 text-xs font-medium text-betfair-navy transition-colors hover:border-betfair-yellow hover:bg-betfair-yellow/10"
          >
            <Download className="h-3.5 w-3.5" />
            Export CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-betfair-border bg-betfair-surface text-xs uppercase tracking-wider text-betfair-muted">
              <th className="px-5 py-3 font-semibold">Date</th>
              <th className="px-3 py-3 font-semibold">Course</th>
              <th className="px-3 py-3 font-semibold">Horse</th>
              <th className="px-3 py-3 font-semibold">Jockey</th>
              <th className="px-3 py-3 font-semibold">Dist</th>
              <th className="px-3 py-3 font-semibold">SP</th>
              <th className="px-3 py-3 font-semibold">Result</th>
              <th className="px-5 py-3 text-right font-semibold">P&L</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-betfair-muted">
                  Loading bets…
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-12 text-center text-betfair-muted">
                  {bets.length === 0
                    ? "No qualifying bets in this date range — try All time"
                    : "No bets match your filters"}
                </td>
              </tr>
            ) : (
              filtered.map((bet) => (
                <tr
                  key={bet.id}
                  className="border-b border-betfair-border/60 transition-colors hover:bg-betfair-surface/80"
                >
                  <td className="whitespace-nowrap px-5 py-3 font-mono text-xs text-betfair-muted">
                    {bet.date ? format(new Date(bet.date), "dd MMM yy") : "—"}
                  </td>
                  <td className="px-3 py-3 text-betfair-navy">{bet.course ?? "—"}</td>
                  <td className="px-3 py-3 font-medium text-betfair-navy">{bet.horse ?? "—"}</td>
                  <td className="px-3 py-3 text-betfair-muted">{bet.jockey ?? "—"}</td>
                  <td className="px-3 py-3">
                    <span className="rounded bg-betfair-yellow/20 px-1.5 py-0.5 text-xs font-semibold text-[#9a6700]">
                      {bet.distance ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-betfair-navy">
                    {formatSp(bet.sp)}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                        bet.won && "bg-green-50 text-betfair-green",
                        !bet.won && bet.placed && "bg-blue-50 text-blue-600",
                        !bet.won && !bet.placed && "bg-red-50 text-betfair-red"
                      )}
                    >
                      {bet.won
                        ? `Won (${bet.finishPos})`
                        : bet.placed
                          ? `Placed (${bet.finishPos})`
                          : bet.finishPos
                            ? `${bet.finishPos}th`
                            : "Lost"}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-5 py-3 text-right font-mono text-sm font-semibold",
                      (bet.pnl ?? 0) >= 0 ? "text-betfair-green" : "text-betfair-red"
                    )}
                  >
                    {bet.pnl !== null ? formatCurrency(bet.pnl) : "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

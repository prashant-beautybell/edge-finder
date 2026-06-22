"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface YearlyChartProps {
  data: Array<{
    year: number;
    winRate: number;
    placedRate: number;
    bets: number;
    pnl: number;
  }>;
  loading?: boolean;
}

const GRID = "#e2e8f0";
const MUTED = "#5c6b7f";

export function YearlyChart({ data, loading }: YearlyChartProps) {
  if (loading) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-betfair-muted">
        Loading chart…
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[280px] items-center justify-center text-sm text-betfair-muted">
        No yearly data for selected range
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="year"
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `${v}%`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #d8dee8",
              borderRadius: "8px",
              color: "#1a2332",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
            formatter={(value, name, item) => {
              const p = item?.payload as { bets?: number; pnl?: number } | undefined;
              const num = Number(value ?? 0);
              if (name === "winRate") return [`${num.toFixed(1)}% (${p?.bets ?? 0} bets)`, "Win rate"];
              if (name === "placedRate") return [`${num.toFixed(1)}%`, "Placed rate"];
              return [String(value), String(name)];
            }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, color: MUTED }}
            formatter={(value) =>
              value === "winRate" ? "Win %" : value === "placedRate" ? "Placed %" : value
            }
          />
          <Bar dataKey="winRate" fill="#ffb80c" radius={[4, 4, 0, 0]} name="winRate" />
          <Bar dataKey="placedRate" fill="#3b82f6" radius={[4, 4, 0, 0]} name="placedRate" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

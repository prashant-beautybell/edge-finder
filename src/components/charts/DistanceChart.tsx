"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface DistanceChartProps {
  data: Array<{ distance: string; winRate: number; bets: number; pnl: number }>;
  loading?: boolean;
}

const GRID = "#e2e8f0";
const MUTED = "#5c6b7f";

export function DistanceChart({ data, loading }: DistanceChartProps) {
  const sorted = [...data].sort((a, b) => b.winRate - a.winRate);

  if (loading) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-betfair-muted">
        Loading chart…
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-betfair-muted">
        No distance data for selected range
      </div>
    );
  }

  return (
    <div className="h-[240px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={sorted}
          layout="vertical"
          margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
        >
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
          <XAxis
            type="number"
            domain={[0, 100]}
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            tickFormatter={(v: number) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="distance"
            tick={{ fill: "#1a2332", fontSize: 12, fontWeight: 600 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #d8dee8",
              borderRadius: "8px",
              color: "#1a2332",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
            formatter={(value, _name, item) => {
              const p = item?.payload as { bets?: number; pnl?: number } | undefined;
              const num = Number(value ?? 0);
              return [
                `${num.toFixed(1)}% WR · ${p?.bets ?? 0} bets · £${(p?.pnl ?? 0).toLocaleString()}`,
                "Win rate",
              ];
            }}
          />
          <Bar dataKey="winRate" fill="#ffb80c" radius={[0, 4, 4, 0]} barSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

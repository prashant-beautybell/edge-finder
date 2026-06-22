"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface MonthlyChartProps {
  data: Array<{ month: string; pnl: number; bets: number; wins: number }>;
  loading?: boolean;
}

const GRID = "#e2e8f0";
const MUTED = "#5c6b7f";

export function MonthlyChart({ data, loading }: MonthlyChartProps) {
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
        No monthly data for selected range
      </div>
    );
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: MUTED, fontSize: 10 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            angle={-35}
            textAnchor="end"
            height={50}
          />
          <YAxis
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v: number) => `£${(v / 1000).toFixed(0)}k`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #d8dee8",
              borderRadius: "8px",
              color: "#1a2332",
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
            formatter={(value, name) => {
              const num = Number(value ?? 0);
              if (name === "pnl") return [`£${num.toLocaleString()}`, "P&L"];
              return [String(value), String(name)];
            }}
          />
          <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.pnl >= 0 ? "#008a1f" : "#d63636"}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

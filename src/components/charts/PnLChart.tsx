"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface PnLChartProps {
  data: Array<{ date: string; pnl: number }>;
  loading?: boolean;
}

const GRID = "#e2e8f0";
const MUTED = "#5c6b7f";

function formatCurrency(value: number) {
  const prefix = value >= 0 ? "+£" : "-£";
  return `${prefix}${Math.abs(value).toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

export function PnLChart({ data, loading }: PnLChartProps) {
  if (loading) {
    return (
      <div className="flex h-[320px] items-center justify-center text-sm text-betfair-muted">
        Loading chart…
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex h-[320px] flex-col items-center justify-center gap-2 text-sm text-betfair-muted">
        <p>No qualifying bets in this date range</p>
        <p className="text-xs">Try &quot;All time&quot; to see all 122 historical picks</p>
      </div>
    );
  }

  const latest = data[data.length - 1]?.pnl ?? 0;
  const isPositive = latest >= 0;

  return (
    <div className="h-[320px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="pnlGradient" x1="0" y1="0" x2="0" y2="1">
              <stop
                offset="0%"
                stopColor={isPositive ? "#008a1f" : "#d63636"}
                stopOpacity={0.25}
              />
              <stop
                offset="100%"
                stopColor={isPositive ? "#008a1f" : "#d63636"}
                stopOpacity={0.02}
              />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tick={{ fill: MUTED, fontSize: 11 }}
            tickLine={false}
            axisLine={{ stroke: GRID }}
            tickFormatter={(v: string) => v.slice(0, 7)}
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
            labelStyle={{ color: MUTED }}
            formatter={(value) => [formatCurrency(Number(value ?? 0)), "Running P&L"]}
          />
          <Area
            type="monotone"
            dataKey="pnl"
            stroke={isPositive ? "#008a1f" : "#d63636"}
            strokeWidth={2}
            fill="url(#pnlGradient)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

import { TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface KPICardProps {
  title: string;
  value: string;
  subtitle?: string;
  trend?: "positive" | "negative" | "neutral";
  loading?: boolean;
  highlight?: boolean;
}

export function KPICard({
  title,
  value,
  subtitle,
  trend = "neutral",
  loading = false,
  highlight = false,
}: KPICardProps) {
  return (
    <div
      className={cn(
        "betfair-card-elevated relative overflow-hidden p-5 transition-all hover:shadow-md",
        highlight && "border-betfair-yellow/50 bg-gradient-to-br from-[#fffdf5] to-white"
      )}
    >
      <p className="text-xs font-semibold uppercase tracking-wider text-betfair-muted">
        {title}
      </p>
      <div className="mt-2 flex items-end gap-2">
        <p
          className={cn(
            "font-mono text-3xl font-bold tracking-tight text-betfair-navy",
            trend === "positive" && "text-betfair-green",
            trend === "negative" && "text-betfair-red"
          )}
        >
          {loading ? "—" : value}
        </p>
        {!loading && trend !== "neutral" ? (
          trend === "positive" ? (
            <TrendingUp className="mb-1 h-5 w-5 text-betfair-green" />
          ) : (
            <TrendingDown className="mb-1 h-5 w-5 text-betfair-red" />
          )
        ) : null}
      </div>
      {subtitle ? (
        <p className="mt-2 text-xs text-betfair-muted">{subtitle}</p>
      ) : null}
    </div>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, CalendarDays, LayoutDashboard, Settings2 } from "lucide-react";
import { SPORT_META, sportBasePath, type SportId } from "@/lib/sports";
import { cn } from "@/lib/utils";

export function DashboardNav({ sport }: { sport: SportId }) {
  const pathname = usePathname();
  const base = sportBasePath(sport);
  const meta = SPORT_META[sport];

  const tabs = [
    { href: base, label: "Overview", icon: LayoutDashboard, exact: true },
    { href: `${base}/today`, label: "Today", icon: CalendarDays },
    ...(meta.hasHistorical
      ? [{ href: `${base}/historical`, label: "Historical", icon: BarChart3, exact: false }]
      : []),
    { href: `${base}/rules`, label: "Algorithm", icon: Settings2, exact: false },
  ];

  return (
    <nav className="border-b border-betfair-border bg-white">
      <div className="mx-auto flex max-w-[1600px] gap-1 px-4 sm:px-6 lg:px-8">
        {tabs.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold transition-colors",
                active
                  ? "border-betfair-yellow text-betfair-navy"
                  : "border-transparent text-betfair-muted hover:border-betfair-border hover:text-betfair-navy"
              )}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarDays, Goal, Sparkles, Trophy } from "lucide-react";
import { SPORT_META, sportBasePath, type SportId } from "@/lib/sports";
import { cn } from "@/lib/utils";

export function TodayNav({ sport }: { sport: SportId }) {
  const pathname = usePathname();
  const base = `${sportBasePath(sport)}/today`;
  const eventsLabel = SPORT_META[sport].eventsLabel;
  const eventsHref = sport === "football" ? `${base}/fixtures` : `${base}/racing`;
  const EventsIcon = sport === "football" ? Goal : Trophy;

  const tabs = [
    { href: base, label: "Overview", icon: CalendarDays, exact: true },
    { href: `${base}/picks`, label: "Edge Picks", icon: Sparkles },
    { href: eventsHref, label: eventsLabel, icon: EventsIcon },
  ];

  return (
    <nav className="border-b border-betfair-border bg-betfair-surface/50">
      <div className="mx-auto flex max-w-[1600px] gap-1 px-4 sm:px-6 lg:px-8">
        {tabs.map(({ href, label, icon: Icon, exact }) => {
          const active = exact ? pathname === href : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-betfair-yellow text-betfair-navy"
                  : "border-transparent text-betfair-muted hover:border-betfair-border hover:text-betfair-navy"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

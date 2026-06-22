"use client";

import { useMemo } from "react";
import {
  endOfMonth,
  endOfWeek,
  endOfYear,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DateRange {
  from?: Date;
  to?: Date;
}

interface DateRangePickerProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS = [
  { label: "All time", getValue: () => ({ from: undefined, to: undefined }) },
  {
    label: "2021–now",
    getValue: () => ({
      from: new Date(Date.UTC(2021, 0, 1)),
      to: new Date(),
    }),
  },
  {
    label: "This year",
    getValue: () => ({
      from: startOfYear(new Date()),
      to: endOfYear(new Date()),
    }),
  },
  {
    label: "This month",
    getValue: () => ({
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date()),
    }),
  },
  {
    label: "This week",
    getValue: () => ({
      from: startOfWeek(new Date(), { weekStartsOn: 1 }),
      to: endOfWeek(new Date(), { weekStartsOn: 1 }),
    }),
  },
];

function toInputValue(date?: Date) {
  if (!date) return "";
  return format(date, "yyyy-MM-dd");
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const label = useMemo(() => {
    if (!value.from && !value.to) return "All time";
    if (value.from && value.to) {
      return `${format(value.from, "dd MMM yyyy")} – ${format(value.to, "dd MMM yyyy")}`;
    }
    if (value.from) return `From ${format(value.from, "dd MMM yyyy")}`;
    return "Select dates";
  }, [value.from, value.to]);

  const activePreset = useMemo(() => {
    return PRESETS.find((preset) => {
      const p = preset.getValue();
      const fromMatch =
        (!p.from && !value.from) ||
        (p.from &&
          value.from &&
          format(p.from, "yyyy-MM-dd") === format(value.from, "yyyy-MM-dd"));
      const toMatch =
        (!p.to && !value.to) ||
        (p.to &&
          value.to &&
          format(p.to, "yyyy-MM-dd") === format(value.to, "yyyy-MM-dd"));
      return fromMatch && toMatch;
    })?.label;
  }, [value.from, value.to]);

  return (
    <div className="betfair-card flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-2 text-sm text-betfair-muted">
        <Calendar className="h-4 w-4 text-betfair-yellow" />
        <span className="font-medium text-betfair-navy">{label}</span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            onClick={() => onChange(preset.getValue())}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition-all",
              activePreset === preset.label
                ? "bg-betfair-yellow text-betfair-navy shadow-sm"
                : "border border-betfair-border bg-white text-betfair-muted hover:border-betfair-yellow/60 hover:text-betfair-navy"
            )}
          >
            {preset.label}
          </button>
        ))}

        <div className="flex items-center gap-1.5 rounded-md border border-betfair-border bg-white px-2 py-1">
          <input
            type="date"
            className="bg-transparent text-xs text-betfair-navy focus:outline-none"
            value={toInputValue(value.from)}
            onChange={(event) =>
              onChange({
                ...value,
                from: event.target.value
                  ? new Date(`${event.target.value}T12:00:00`)
                  : undefined,
              })
            }
          />
          <span className="text-xs text-betfair-muted">→</span>
          <input
            type="date"
            className="bg-transparent text-xs text-betfair-navy focus:outline-none"
            value={toInputValue(value.to)}
            onChange={(event) =>
              onChange({
                ...value,
                to: event.target.value
                  ? new Date(`${event.target.value}T12:00:00`)
                  : undefined,
              })
            }
          />
        </div>
      </div>
    </div>
  );
}

export function toQueryRange(range: DateRange) {
  return {
    from: range.from ? format(range.from, "yyyy-MM-dd") : undefined,
    to: range.to ? format(range.to, "yyyy-MM-dd") : undefined,
  };
}

export function defaultHistoricalRange(): DateRange {
  return { from: undefined, to: undefined };
}

export type AlertSide = "back" | "lay";

export type AlertComparator = "eq" | "gte" | "lte" | "gt" | "lt";

export interface PriceAlert {
  id: string;
  runnerId: number;
  horseName: string;
  side: AlertSide;
  comparator: AlertComparator;
  targetPrice: number;
}

export interface PriceHit {
  alert: PriceAlert;
  currentPrice: number;
  raceCourse: string;
  raceTime: string;
}

interface RunnerPrices {
  id: number;
  horseName: string;
  exchangePrice: number | null;
  exchangeLayPrice: number | null;
}

const PRICE_TOLERANCE = 0.02;

export const COMPARATOR_OPTIONS: Array<{ value: AlertComparator; label: string }> = [
  { value: "eq", label: "Equals" },
  { value: "gte", label: "Equals or greater (≥)" },
  { value: "lte", label: "Equals or smaller (≤)" },
  { value: "gt", label: "Greater than (>)" },
  { value: "lt", label: "Smaller than (<)" },
];

export function formatComparator(comparator: AlertComparator): string {
  switch (comparator) {
    case "eq":
      return "=";
    case "gte":
      return "≥";
    case "lte":
      return "≤";
    case "gt":
      return ">";
    case "lt":
      return "<";
  }
}

export function formatComparatorLabel(comparator: AlertComparator): string {
  return COMPARATOR_OPTIONS.find((o) => o.value === comparator)?.label ?? comparator;
}

function matchesComparator(
  current: number,
  target: number,
  comparator: AlertComparator
): boolean {
  switch (comparator) {
    case "eq":
      return Math.abs(current - target) <= PRICE_TOLERANCE;
    case "gte":
      return current + PRICE_TOLERANCE >= target;
    case "lte":
      return current - PRICE_TOLERANCE <= target;
    case "gt":
      return current > target + PRICE_TOLERANCE;
    case "lt":
      return current < target - PRICE_TOLERANCE;
  }
}

export function isPriceHit(alert: PriceAlert, runner: RunnerPrices): boolean {
  if (alert.runnerId !== runner.id) return false;

  const current =
    alert.side === "back" ? runner.exchangePrice : runner.exchangeLayPrice;

  if (current === null) return false;
  return matchesComparator(current, alert.targetPrice, alert.comparator);
}

export function findPriceHits(
  alerts: PriceAlert[],
  runners: RunnerPrices[],
  meta: { course: string; raceTime: string }
): PriceHit[] {
  const hits: PriceHit[] = [];

  for (const alert of alerts) {
    const runner = runners.find((r) => r.id === alert.runnerId);
    if (!runner || !isPriceHit(alert, runner)) continue;

    const currentPrice =
      alert.side === "back" ? runner.exchangePrice! : runner.exchangeLayPrice!;

    hits.push({
      alert,
      currentPrice,
      raceCourse: meta.course,
      raceTime: meta.raceTime,
    });
  }

  return hits;
}

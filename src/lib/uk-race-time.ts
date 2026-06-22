export interface RaceWithTime {
  id: string;
  raceTime: string;
}

const UK_TIMEZONE = "Europe/London";
/** Keep showing a race this long after its off time (in-play / results pending). */
const LIVE_WINDOW_MS = 45 * 60 * 1000;

function ukParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: UK_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((p) => p.type === type)?.value ?? 0);

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

/** Wall-clock instant in UK, comparable across race off times. */
export function toUkComparableMs(value: Date | string): number {
  const date = typeof value === "string" ? new Date(value) : value;
  const { year, month, day, hour, minute, second } = ukParts(date);
  return Date.UTC(year, month - 1, day, hour, minute, second);
}

export function getUkNow(): Date {
  return new Date();
}

/**
 * Pick the race closest to UK now — prefer the next off, otherwise the most
 * recent race still inside the live window.
 */
export function findNearestLiveRace<T extends RaceWithTime>(
  races: T[],
  now = getUkNow()
): T | null {
  if (races.length === 0) return null;

  const nowMs = toUkComparableMs(now);
  let best: { race: T; score: number } | null = null;

  for (const race of races) {
    const raceMs = toUkComparableMs(race.raceTime);
    const diff = raceMs - nowMs;

    if (diff < -LIVE_WINDOW_MS) continue;

    const score = diff >= 0 ? diff : 10_000_000_000 + Math.abs(diff);
    if (!best || score < best.score) {
      best = { race, score };
    }
  }

  if (best) return best.race;

  return races.reduce((nearest, race) => {
    const nearestDiff = Math.abs(toUkComparableMs(nearest.raceTime) - nowMs);
    const raceDiff = Math.abs(toUkComparableMs(race.raceTime) - nowMs);
    return raceDiff < nearestDiff ? race : nearest;
  });
}

export function formatUkTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: UK_TIMEZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

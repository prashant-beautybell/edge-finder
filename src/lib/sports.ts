export const SPORTS = ["racing", "football"] as const;
export type SportId = (typeof SPORTS)[number];

export interface SportMeta {
  id: SportId;
  label: string;
  tagline: string;
  eventsLabel: string;
  dbLabel: string;
  hasHistorical: boolean;
}

export const SPORT_META: Record<SportId, SportMeta> = {
  racing: {
    id: "racing",
    label: "Horse Racing",
    tagline: "9-rule UK turf handicap algorithm",
    eventsLabel: "Racing",
    dbLabel: "Racing DB",
    hasHistorical: true,
  },
  football: {
    id: "football",
    label: "Football",
    tagline: "Match odds value algorithm",
    eventsLabel: "Fixtures",
    dbLabel: "Football DB",
    hasHistorical: false,
  },
};

export function isSportId(value: string): value is SportId {
  return (SPORTS as readonly string[]).includes(value);
}

export function sportBasePath(sport: SportId): string {
  return `/dashboard/${sport}`;
}

/**
 * Map the current path when switching sports (fixtures ↔ racing, historical → today for football).
 */
export function translateSportPath(
  fromSport: SportId,
  toSport: SportId,
  pathname: string
): string {
  if (fromSport === toSport) return pathname;

  let suffix = pathname.replace(`/dashboard/${fromSport}`, "") || "";

  if (suffix.startsWith("/today/fixtures")) {
    suffix =
      toSport === "football"
        ? suffix
        : suffix.replace("/today/fixtures", "/today/racing");
  } else if (suffix.startsWith("/today/racing")) {
    suffix =
      toSport === "racing"
        ? suffix
        : suffix.replace("/today/racing", "/today/fixtures");
  }

  if (toSport === "football" && suffix.startsWith("/historical")) {
    suffix = "/today";
  }

  return `/dashboard/${toSport}${suffix}`;
}

export function defaultSport(): SportId {
  return "racing";
}

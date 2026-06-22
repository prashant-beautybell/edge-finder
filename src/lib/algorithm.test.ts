import { describe, expect, it } from "vitest";
import { applyAlgorithm } from "@/lib/algorithm";

const baseRace = {
  isHandicap: true,
  isTurf: true,
  fieldSize: 8,
};

const baseRunner = {
  horseName: "Test Horse",
  jockey: "Test Jockey",
  officialRating: 85,
  weightTotalLbs: 130,
  spDecimal: 2.5,
  distanceBand: "7f",
  isFavourite: true,
  ltoFinishPos: 1,
  ltoWasTopRated: true,
  ltoDistanceBand: "7f",
  jockeySrPct: 18,
  jockeyRides: 50,
};

describe("applyAlgorithm (spec)", () => {
  it("qualifies when all rules pass", () => {
    const result = applyAlgorithm(baseRace, baseRunner, 0);
    expect(result.qualifies).toBe(true);
    expect(result.failedRule).toBeNull();
  });

  it("fails R1 when not a turf handicap", () => {
    const result = applyAlgorithm({ ...baseRace, isTurf: false }, baseRunner, 0);
    expect(result.failedRule).toBe("R1_turf_handicap");
  });

  it("fails SP cap when odds are above 6/4 decimal", () => {
    const result = applyAlgorithm(baseRace, { ...baseRunner, spDecimal: 2.6 }, 0);
    expect(result.failedRule).toBe("SP_cap");
  });

  it("treats CSV evens as 2.0 decimal and passes SP cap", () => {
    const result = applyAlgorithm(baseRace, { ...baseRunner, spDecimal: 2.0 }, 0);
    expect(result.allRulesPassed.SP_cap).toBe(true);
  });

  it("skips jockey SR when threshold is 0", () => {
    const result = applyAlgorithm(
      baseRace,
      { ...baseRunner, jockeySrPct: null, jockeyRides: null },
      0
    );
    expect(result.allRulesPassed.R8_jockey_sr).toBe(true);
    expect(result.qualifies).toBe(true);
  });

  it("requires jockey SR when threshold is set", () => {
    const result = applyAlgorithm(
      baseRace,
      { ...baseRunner, jockeySrPct: 12, jockeyRides: 20 },
      15
    );
    expect(result.failedRule).toBe("R8_jockey_sr");
  });
});

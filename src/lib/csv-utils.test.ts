import { describe, expect, it } from "vitest";
import { distBandFromYards, parseSpDecimal } from "@/lib/csv-utils";

describe("csv-utils (spec)", () => {
  it("adds 1 to CSV Sp for true decimal", () => {
    expect(parseSpDecimal("1.0")).toBe(2);
    expect(parseSpDecimal("1.5")).toBe(2.5);
    expect(parseSpDecimal("0.5")).toBe(1.5);
  });

  it("maps yards to distance bands per spec", () => {
    expect(distBandFromYards(1320)).toBe("6f");
    expect(distBandFromYards(1540)).toBe("7f");
    expect(distBandFromYards(1760)).toBe("1m");
    expect(distBandFromYards(1100)).toBeNull();
  });
});

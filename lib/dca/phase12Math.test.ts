import { describe, expect, it } from "vitest";
import {
  applyInverseRsiWaterfall,
  inverseRsiWeight,
} from "@/lib/dca/confluence";
import { mktPercentFromRsi } from "@/lib/dca/executionMath";

describe("Phase 12 MKT/LMT split (immutable)", () => {
  it("uses 90 - ((RSI - 30) * 2) clamped to 10–90", () => {
    expect(mktPercentFromRsi(30)).toBe(90);
    expect(mktPercentFromRsi(50)).toBe(50);
    expect(mktPercentFromRsi(70)).toBe(10);
    expect(mktPercentFromRsi(0)).toBe(90);
    expect(mktPercentFromRsi(100)).toBe(10);
  });

  it("pairs LMT as the complement of MKT", () => {
    for (const rsi of [12, 28, 44, 61, 88]) {
      const mkt = mktPercentFromRsi(rsi);
      expect(mkt + (100 - mkt)).toBe(100);
      expect(mkt).toBeGreaterThanOrEqual(10);
      expect(mkt).toBeLessThanOrEqual(90);
    }
  });
});

describe("Phase 12 inverse RSI waterfall (immutable)", () => {
  it("weights surviving tokens as 100 − RSI", () => {
    expect(inverseRsiWeight(65)).toBe(35);
    expect(inverseRsiWeight(40)).toBe(60);
  });

  it("splits a surviving basket proportional to inverse RSI", () => {
    const result = applyInverseRsiWaterfall(
      100,
      [
        { symbol: "LINK", approved: true, priced: true, rsi: 65 },
        { symbol: "AAVE", approved: true, priced: true, rsi: 40 },
      ],
      "Satelity",
    );
    const link = result.amounts.get("LINK") ?? 0;
    const aave = result.amounts.get("AAVE") ?? 0;
    expect(link + aave).toBeCloseTo(100, 2);
    expect(aave).toBeGreaterThan(link);
    expect(result.weights.get("LINK") ?? 0).toBeCloseTo((35 / 95) * 100, 5);
    expect(result.weights.get("AAVE") ?? 0).toBeCloseTo((60 / 95) * 100, 5);
    expect(result.leftoverUsd).toBe(0);
  });

  it("sends a fully rejected basket to Dostupný Kapitál", () => {
    const result = applyInverseRsiWaterfall(
      80,
      [
        { symbol: "ETH", approved: false, priced: true, rsi: 12 },
        { symbol: "SOL", approved: false, priced: true, rsi: 14 },
      ],
      "Satelity",
    );
    expect(result.mode).toBe("full");
    expect(result.leftoverUsd).toBe(80);
    expect(result.redirectedUsd).toBe(80);
    expect(result.amounts.get("ETH")).toBe(0);
    expect(result.amounts.get("SOL")).toBe(0);
  });

  it("reallocates failed members into survivors and still sums to the basket budget", () => {
    const budget = 90;
    const result = applyInverseRsiWaterfall(
      budget,
      [
        { symbol: "ETH", approved: false, priced: true, rsi: 12 },
        { symbol: "LINK", approved: true, priced: true, rsi: 65 },
        { symbol: "AAVE", approved: true, priced: true, rsi: 40 },
      ],
      "Satelity",
    );
    const allocated = [...result.amounts.values()].reduce((sum, value) => sum + value, 0);
    expect(allocated).toBeCloseTo(budget, 2);
    expect(result.leftoverUsd).toBe(0);
    expect(result.mode).toBe("partial");
    expect(result.fromSymbols).toEqual(["ETH"]);
    expect(result.toSymbols).toEqual(["LINK", "AAVE"]);
  });
});

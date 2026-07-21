import type { YieldFilterCondition } from "@/lib/dcaYieldFilter";
import type { AssetCategory } from "@/lib/portfolioStorage";

export type IndicatorTone = "neutral" | "bullish" | "bearish" | "warning";

export interface TokenIndicatorChip {
  label: string;
  value: string;
  tone: IndicatorTone;
}

export type RegimeStatusTone = "ok" | "brake" | "watch";

export interface TokenIndicatorSnapshot {
  chips: TokenIndicatorChip[];
  regimeStatusLabel: string;
  regimeStatusTone: RegimeStatusTone;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function formatSignedPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${round1(value)}%`;
}

function rsiTone(rsi: number): IndicatorTone {
  if (rsi < 38) return "bullish";
  if (rsi > 65) return "warning";
  return "neutral";
}

export function buildTokenIndicatorSnapshot(input: {
  category: AssetCategory;
  symbol: string;
  rsi14: number | null;
  atr14dPct: number | null;
  distSma200Pct?: number | null;
  ema50DeviationPct?: number | null;
  priceVsSma14Pct?: number | null;
  fundamentalScore?: number | null;
  convictionScore?: number | null;
  safetyBrakeActive: boolean;
}): TokenIndicatorSnapshot {
  const rsi = input.rsi14;
  const atr = input.atr14dPct;

  if (input.category === "core") {
    const chips: TokenIndicatorChip[] = [];

    if (input.distSma200Pct != null) {
      chips.push({
        label: "200D SMA",
        value: formatSignedPct(input.distSma200Pct),
        tone:
          input.distSma200Pct >= 15
            ? "warning"
            : input.distSma200Pct <= -5
              ? "bullish"
              : "neutral",
      });
    }

    if (rsi != null) {
      chips.push({
        label: "RSI",
        value: rsi.toFixed(0),
        tone: rsiTone(rsi),
      });
    }

    if (input.ema50DeviationPct != null) {
      chips.push({
        label: "50D EMA",
        value: formatSignedPct(input.ema50DeviationPct),
        tone:
          input.ema50DeviationPct >= 0 ? "warning" : "bullish",
      });
    }

    return {
      chips,
      regimeStatusLabel: input.safetyBrakeActive ? "SAFETY BRAKE" : "V NORME",
      regimeStatusTone: input.safetyBrakeActive ? "brake" : "ok",
    };
  }

  if (input.category === "satellite") {
    const chips: TokenIndicatorChip[] = [];

    if (rsi != null) {
      chips.push({
        label: "RSI",
        value: rsi.toFixed(0),
        tone: rsiTone(rsi),
      });
    }

    if (atr != null) {
      chips.push({
        label: "ATR",
        value: `${round1(atr)}%`,
        tone: "neutral",
      });
    }

    if (input.ema50DeviationPct != null) {
      chips.push({
        label: "50D EMA",
        value: formatSignedPct(input.ema50DeviationPct),
        tone: input.ema50DeviationPct >= 0 ? "warning" : "bullish",
      });
    }

    const watch = rsi != null && rsi > 65;

    return {
      chips,
      regimeStatusLabel: watch ? "MOMENTUM WATCH" : "V NORME",
      regimeStatusTone: watch ? "watch" : "ok",
    };
  }

  const chips: TokenIndicatorChip[] = [];

  if (input.convictionScore != null) {
    chips.push({
      label: "S",
      value: String(Math.round(input.convictionScore)),
      tone:
        input.convictionScore >= 70
          ? "bullish"
          : input.convictionScore >= 50
            ? "neutral"
            : "bearish",
    });
  }

  if (rsi != null) {
    chips.push({
      label: "RSI",
      value: rsi.toFixed(0),
      tone: rsiTone(rsi),
    });
  }

  if (input.priceVsSma14Pct != null) {
    chips.push({
      label: "MA14",
      value: formatSignedPct(input.priceVsSma14Pct),
      tone:
        input.priceVsSma14Pct >= 0
          ? "neutral"
          : input.priceVsSma14Pct >= -10
            ? "bullish"
            : "bearish",
    });
  }

  if (input.fundamentalScore != null) {
    chips.push({
      label: "Fund.",
      value: String(Math.round(input.fundamentalScore)),
      tone:
        input.fundamentalScore >= 50
          ? "bullish"
          : input.fundamentalScore >= 35
            ? "neutral"
            : "bearish",
    });
  }

  return {
    chips,
    regimeStatusLabel:
      rsi != null && rsi < 38 ? "MIN ORDER ZONE" : "V NORME",
    regimeStatusTone: rsi != null && rsi < 38 ? "watch" : "ok",
  };
}

export function summarizeYieldFilterConditions(
  conditions: YieldFilterCondition[] | undefined,
  filtersPassedCount: number,
): string {
  if (!conditions?.length) {
    return `${filtersPassedCount}/3 podmienok`;
  }

  const parts = conditions.map((condition) => {
    if (condition.id === "rsi") {
      return condition.passed ? "RSI Oversold" : "RSI Fail";
    }
    if (condition.id === "sma14") {
      return condition.passed ? "Momentum OK" : "Momentum Fail";
    }
    return condition.passed
      ? `Fundamentals (${condition.detail.match(/\d+/)?.[0] ?? "OK"})`
      : "Fundamentals Fail";
  });

  return `${parts.join(" • ")} • ${filtersPassedCount}/3 podmienok`;
}

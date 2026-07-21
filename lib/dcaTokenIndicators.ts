import type { YieldFilterCondition } from "@/lib/dcaYieldFilter";
import type { AssetCategory } from "@/lib/portfolioStorage";
import type { YieldSatelliteMetrics } from "@/lib/yieldSatelliteMetrics";
import {
  formatDecimal,
  formatMultiplier,
  formatPct,
  formatSignedPct,
} from "@/lib/numberFormat";

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

function formatSignedPctValue(value: number): string {
  return formatSignedPct(value, 1);
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
  yieldSatelliteMetrics?: YieldSatelliteMetrics | null;
}): TokenIndicatorSnapshot {
  const rsi = input.rsi14;
  const atr = input.atr14dPct;

  if (input.category === "core") {
    const chips: TokenIndicatorChip[] = [];

    if (input.distSma200Pct != null) {
      chips.push({
        label: "200D SMA",
        value: formatSignedPctValue(input.distSma200Pct),
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
        value: formatSignedPctValue(input.ema50DeviationPct),
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
    const metrics = input.yieldSatelliteMetrics;
    const chips: TokenIndicatorChip[] = [];

    if (metrics) {
      const apyLabel = metrics.apyIsEstimated
        ? `APY (${metrics.apySourceLabel ?? "Odhad"})`
        : `APY · ${metrics.apySourceLabel ?? "Live"}`;
      chips.push(
        {
          label: apyLabel,
          value: formatPct(metrics.apyPct, 1),
          tone: metrics.apyPct >= 6 ? "bullish" : "neutral",
        },
        {
          label: "IL R/R",
          value: formatMultiplier(metrics.ilRiskRewardRatio, 1),
          tone:
            metrics.ilRiskRewardRatio >= 1.5
              ? "bullish"
              : metrics.ilRiskRewardRatio < 0.8
                ? "warning"
                : "neutral",
        },
        {
          label: "Staking",
          value: formatMultiplier(metrics.stakingYieldMultiplier, 2),
          tone: "bullish",
        },
        {
          label: "ATR pás",
          value: formatMultiplier(metrics.atrLimitMultiplier, 1),
          tone: "neutral",
        },
      );
    } else {
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
          value: `${formatDecimal(atr, 1)}%`,
          tone: "neutral",
        });
      }
    }

    const watch = rsi != null && rsi > 65;

    return {
      chips,
      regimeStatusLabel: watch ? "MOMENTUM WATCH" : "STAKING OK",
      regimeStatusTone: watch ? "watch" : "ok",
    };
  }

  const metrics = input.yieldSatelliteMetrics;
  const chips: TokenIndicatorChip[] = [];

  if (metrics) {
    const apyLabel = metrics.apyIsEstimated
      ? `APY (${metrics.apySourceLabel ?? "Odhad"})`
      : `APY · ${metrics.apySourceLabel ?? "Live"}`;
    chips.push(
      {
        label: apyLabel,
        value: formatPct(metrics.apyPct, 1),
        tone: metrics.apyPct >= 8 ? "bullish" : "neutral",
      },
      {
        label: "IL R/R",
        value: formatMultiplier(metrics.ilRiskRewardRatio, 1),
        tone:
          metrics.ilRiskRewardRatio >= 1.2
            ? "bullish"
            : metrics.ilRiskRewardRatio < 0.7
              ? "warning"
              : "neutral",
      },
      {
        label: "Compound",
        value: formatMultiplier(metrics.stakingYieldMultiplier, 2),
        tone: "bullish",
      },
      {
        label: "Limit pás",
        value: `${formatMultiplier(metrics.atrLimitMultiplier, 1)}ATR`,
        tone: "neutral",
      },
    );
  } else {
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
  }

  return {
    chips,
    regimeStatusLabel:
      metrics && metrics.apyPct >= 10
        ? "YIELD COMPOUND"
        : rsi != null && rsi < 38
          ? "MIN ORDER ZONE"
          : "V NORME",
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

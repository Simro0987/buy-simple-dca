/**
 * Centralized continuous (linear interpolation) scoring for the DCA engine.
 * Scale: 0 = extremely cheap / panic, 100 = extremely expensive / euphoria.
 */

import {
  clamp,
  computeAtr14Pct,
  computeEma,
  computeRsi14,
  computeSma,
  lerpScore,
  type OhlcBar,
} from "@/lib/dcaTechnicalIndicators";

export type { OhlcBar };

export const FACTOR_WEIGHTS = {
  value: 0.3,
  trend: 0.2,
  sentiment: 0.2,
  momentum: 0.15,
  risk: 0.15,
} as const;

const VALUE_DIST_MIN = -40;
const VALUE_DIST_MAX = 40;
const TREND_RATIO_MIN = -15;
const TREND_RATIO_MAX = 15;
const RISK_ATR_MIN = 0.5;
const RISK_ATR_MAX = 10;

export interface MarketTechnicals {
  price: number;
  sma200d: number;
  wma200w: number;
  ema50: number;
  rsi14: number;
  atr14Pct: number;
  distSmaPct: number;
  distWmaPct: number;
  ema50VsSma200Pct: number;
}

export interface RawFactorScores {
  value: number;
  trend: number;
  sentiment: number;
  momentum: number;
  risk: number;
}

export function buildMarketTechnicals(
  dailyBars: OhlcBar[],
  weeklyCloses: number[],
): MarketTechnicals {
  const closes = dailyBars.map((b) => b.close);
  const price = closes[closes.length - 1];
  const sma200d = computeSma(closes, 200);
  const ema50 = computeEma(closes, 50);
  const wma200w =
    weeklyCloses.length >= 200
      ? computeSma(weeklyCloses, 200)
      : computeSma(weeklyCloses, weeklyCloses.length);

  const distSmaPct =
    sma200d > 0 ? ((price - sma200d) / sma200d) * 100 : 0;
  const distWmaPct =
    wma200w > 0 ? ((price - wma200w) / wma200w) * 100 : 0;
  const ema50VsSma200Pct =
    sma200d > 0 ? ((ema50 - sma200d) / sma200d) * 100 : 0;

  return {
    price,
    sma200d,
    wma200w: wma200w || price,
    ema50,
    rsi14: computeRsi14(closes),
    atr14Pct: computeAtr14Pct(dailyBars),
    distSmaPct,
    distWmaPct,
    ema50VsSma200Pct,
  };
}

export function scoreValue(distSmaPct: number): number {
  return clamp(
    lerpScore(distSmaPct, VALUE_DIST_MIN, VALUE_DIST_MAX, 0, 100),
    0,
    100,
  );
}

export function scoreTrend(ema50VsSma200Pct: number): number {
  return clamp(
    lerpScore(ema50VsSma200Pct, TREND_RATIO_MIN, TREND_RATIO_MAX, 0, 100),
    0,
    100,
  );
}

export function scoreSentiment(fearGreedIndex: number): number {
  return clamp(fearGreedIndex, 0, 100);
}

export function scoreMomentum(rsi14: number): number {
  return clamp(rsi14, 0, 100);
}

export function scoreRisk(atr14Pct: number): number {
  return clamp(
    lerpScore(atr14Pct, RISK_ATR_MIN, RISK_ATR_MAX, 0, 100),
    0,
    100,
  );
}

export function computeRawFactorScores(
  technicals: MarketTechnicals,
  fearGreedIndex: number,
): RawFactorScores {
  return {
    value: scoreValue(technicals.distSmaPct),
    trend: scoreTrend(technicals.ema50VsSma200Pct),
    sentiment: scoreSentiment(fearGreedIndex),
    momentum: scoreMomentum(technicals.rsi14),
    risk: scoreRisk(technicals.atr14Pct),
  };
}

export function computeFinalScoreRaw(factors: RawFactorScores): number {
  return (
    factors.value * FACTOR_WEIGHTS.value +
    factors.trend * FACTOR_WEIGHTS.trend +
    factors.sentiment * FACTOR_WEIGHTS.sentiment +
    factors.momentum * FACTOR_WEIGHTS.momentum +
    factors.risk * FACTOR_WEIGHTS.risk
  );
}

export function computeBaseAllocation(finalScoreRaw: number): number {
  return clamp(82 - finalScoreRaw * 0.62, 22, 80);
}

export function applyConfidenceMultiplier(
  baseAllocationRaw: number,
  multiplier: number,
): number {
  return baseAllocationRaw * multiplier;
}

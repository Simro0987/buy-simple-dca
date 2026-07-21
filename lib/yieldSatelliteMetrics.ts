import type { AssetCategory } from "@/lib/portfolioStorage";
import { clamp, lerpScore } from "@/lib/dcaTechnicalIndicators";

export const SATELLITE_ATR_LIMIT_MULTIPLIER = 1.8;
export const YIELD_ATR_LIMIT_MULTIPLIER = 2.5;
export const SATELLITE_REBALANCE_ATR_FACTOR = 2.5;
export const YIELD_REBALANCE_ATR_FACTOR = 3.0;

/** Benchmark base APY (% p.a.) — adjusted live by volatility & fundamentals. */
const BASE_APY_BY_SYMBOL: Record<string, number> = {
  SOL: 6.8,
  ETH: 3.9,
  HYPE: 12.4,
  JUP: 8.6,
  PENDLE: 14.2,
  GMX: 11.5,
  AAVE: 3.8,
  MORPHO: 7.2,
  LINK: 2.4,
};

export interface YieldSatelliteMetrics {
  apyPct: number;
  ilRiskRewardRatio: number;
  stakingYieldMultiplier: number;
  atrLimitMultiplier: number;
  rebalanceThresholdPct: number;
  ilRiskPct: number;
  explanationLabel: "yield" | "limit";
  whyExecutionText: string;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function resolveBaseApy(symbol: string, category: AssetCategory): number {
  const base = BASE_APY_BY_SYMBOL[symbol] ?? (category === "yield" ? 9.5 : 5.5);
  return base;
}

function estimateLiveApy(input: {
  symbol: string;
  category: AssetCategory;
  atr14dPct: number | null;
  fundamentalScore?: number | null;
  convictionScore?: number | null;
}): number {
  const base = resolveBaseApy(input.symbol, input.category);
  const atr = input.atr14dPct ?? 4;
  const volBoost = lerpScore(atr, 2, 10, 0.85, 1.15);
  const fund = input.fundamentalScore ?? 55;
  const fundBoost = lerpScore(fund, 30, 80, 0.9, 1.12);
  const conviction = input.convictionScore ?? 50;
  const convictionBoost =
    input.category === "yield"
      ? lerpScore(conviction, 40, 90, 0.95, 1.1)
      : 1;

  return round1(clamp(base * volBoost * fundBoost * convictionBoost, 0.5, 45));
}

function estimateIlRiskPct(atr14dPct: number | null, category: AssetCategory): number {
  const atr = atr14dPct ?? 4;
  const factor = category === "yield" ? 1.35 : 1.15;
  return round1(clamp(atr * factor, 1, 18));
}

export function computeYieldSatelliteMetrics(input: {
  symbol: string;
  category: AssetCategory;
  atr14dPct: number | null;
  fundamentalScore?: number | null;
  convictionScore?: number | null;
  limitPullbackPct?: number;
}): YieldSatelliteMetrics | null {
  if (input.category !== "yield" && input.category !== "satellite") {
    return null;
  }

  const apyPct = estimateLiveApy(input);
  const ilRiskPct = estimateIlRiskPct(input.atr14dPct, input.category);
  const ilRiskRewardRatio = round1(
    clamp(apyPct / Math.max(ilRiskPct, 0.8), 0.3, 8),
  );
  const stakingYieldMultiplier = round1(
    clamp(1 + (apyPct / 100) * 0.85, 1, 1.45),
  );

  const atrLimitMultiplier =
    input.category === "yield"
      ? YIELD_ATR_LIMIT_MULTIPLIER
      : SATELLITE_ATR_LIMIT_MULTIPLIER;
  const rebalanceFactor =
    input.category === "yield"
      ? YIELD_REBALANCE_ATR_FACTOR
      : SATELLITE_REBALANCE_ATR_FACTOR;
  const rebalanceThresholdPct = round1(
    (input.atr14dPct ?? 4) * rebalanceFactor,
  );

  const pullback = input.limitPullbackPct ?? rebalanceThresholdPct;
  const whyExecutionText = buildWhyExecutionText({
    symbol: input.symbol,
    category: input.category,
    apyPct,
    ilRiskRewardRatio,
    stakingYieldMultiplier,
    atrLimitMultiplier,
    rebalanceThresholdPct: pullback,
    ilRiskPct,
  });

  return {
    apyPct,
    ilRiskRewardRatio,
    stakingYieldMultiplier,
    atrLimitMultiplier,
    rebalanceThresholdPct,
    ilRiskPct,
    explanationLabel: input.category === "yield" ? "yield" : "limit",
    whyExecutionText,
  };
}

function buildWhyExecutionText(input: {
  symbol: string;
  category: AssetCategory;
  apyPct: number;
  ilRiskRewardRatio: number;
  stakingYieldMultiplier: number;
  atrLimitMultiplier: number;
  rebalanceThresholdPct: number;
  ilRiskPct: number;
}): string {
  if (input.category === "yield") {
    return (
      `PREČO YIELD? ${input.symbol} generuje ~${input.apyPct.toFixed(1)}% APY, ` +
      `IL Risk/Reward ${input.ilRiskRewardRatio.toFixed(1)}× (IL riziko ~${input.ilRiskPct.toFixed(1)}%). ` +
      `Systém drží širší limitný pás ${input.atrLimitMultiplier.toFixed(1)}×ATR (−${input.rebalanceThresholdPct.toFixed(1)}%), ` +
      `aby maximalizoval lacný nákup pred auto-kompaundáciou (staking multiplikátor ${input.stakingYieldMultiplier.toFixed(2)}×).`
    );
  }

  return (
    `PREČO LIMIT? ${input.symbol} Satellite staking ~${input.apyPct.toFixed(1)}% APY, ` +
    `IL Risk/Reward ${input.ilRiskRewardRatio.toFixed(1)}× pri IL riziku ~${input.ilRiskPct.toFixed(1)}%. ` +
    `Širší limitný pás ${input.atrLimitMultiplier.toFixed(1)}×ATR (−${input.rebalanceThresholdPct.toFixed(1)}%) ` +
    `kvôli vyššej volatilite — čakáme na hlbší vstup pred reinvestíciou odmien (${input.stakingYieldMultiplier.toFixed(2)}×).`
  );
}

export function getAtrLimitMultiplier(category: AssetCategory): number {
  if (category === "yield") return YIELD_ATR_LIMIT_MULTIPLIER;
  if (category === "satellite") return SATELLITE_ATR_LIMIT_MULTIPLIER;
  return 1.5;
}

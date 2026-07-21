import type { AssetCategory } from "@/lib/portfolioStorage";
import { clamp } from "@/lib/dcaTechnicalIndicators";
import type { ResolvedYieldApy, YieldApySource } from "@/lib/yieldDataSources";
import { resolveYieldApy } from "@/lib/yieldDataSources";

export const SATELLITE_ATR_LIMIT_MULTIPLIER = 1.8;
export const YIELD_ATR_LIMIT_MULTIPLIER = 2.5;
export const SATELLITE_REBALANCE_ATR_FACTOR = 2.5;
export const YIELD_REBALANCE_ATR_FACTOR = 3.0;

export interface YieldSatelliteMetrics {
  apyPct: number;
  apySource: YieldApySource;
  apyIsEstimated: boolean;
  apySourceLabel: string;
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
  /** Pre-resolved APY from portfolio / API / DeFiLlama / fallback chain. */
  apyRecord?: ResolvedYieldApy | null;
  portfolio?: import("@/lib/yieldDataSources").PortfolioYieldContext | null;
  apiApyPct?: number | null;
  defillamaApyPct?: number | null;
}): YieldSatelliteMetrics | null {
  if (input.category !== "yield" && input.category !== "satellite") {
    return null;
  }

  const apyRecord =
    input.apyRecord ??
    resolveYieldApy({
      symbol: input.symbol,
      category: input.category,
      portfolio: input.portfolio,
      apiApyPct: input.apiApyPct,
      defillamaApyPct: input.defillamaApyPct,
      atr14dPct: input.atr14dPct,
      fundamentalScore: input.fundamentalScore,
      convictionScore: input.convictionScore,
    });

  const apyPct = apyRecord.apyPct;
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
    apySourceLabel: apyRecord.sourceLabel,
    apyIsEstimated: apyRecord.isEstimated,
    ilRiskRewardRatio,
    stakingYieldMultiplier,
    atrLimitMultiplier,
    rebalanceThresholdPct: pullback,
    ilRiskPct,
  });

  return {
    apyPct,
    apySource: apyRecord.source,
    apyIsEstimated: apyRecord.isEstimated,
    apySourceLabel: apyRecord.sourceLabel,
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
  apySourceLabel: string;
  apyIsEstimated: boolean;
  ilRiskRewardRatio: number;
  stakingYieldMultiplier: number;
  atrLimitMultiplier: number;
  rebalanceThresholdPct: number;
  ilRiskPct: number;
}): string {
  const apyQualifier = input.apyIsEstimated
    ? `~${input.apyPct.toFixed(1)}% APY (${input.apySourceLabel})`
    : `${input.apyPct.toFixed(1)}% APY · ${input.apySourceLabel}`;

  if (input.category === "yield") {
    return (
      `PREČO YIELD? ${input.symbol} generuje ${apyQualifier}, ` +
      `IL Risk/Reward ${input.ilRiskRewardRatio.toFixed(1)}× (IL riziko ~${input.ilRiskPct.toFixed(1)}%). ` +
      `Systém drží širší limitný pás ${input.atrLimitMultiplier.toFixed(1)}×ATR (−${input.rebalanceThresholdPct.toFixed(1)}%), ` +
      `aby maximalizoval lacný nákup pred auto-kompaundáciou (staking multiplikátor ${input.stakingYieldMultiplier.toFixed(2)}×).`
    );
  }

  return (
    `PREČO LIMIT? ${input.symbol} Satellite staking ${apyQualifier}, ` +
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

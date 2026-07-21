import type { AssetCategory } from "@/lib/portfolioStorage";
import {
  formatCopyAmount2,
  normalizeLimitPrice,
} from "@/lib/executionFormatting";
import {
  buildDynamicLimitReasoning,
  computeBelowSpotPercent,
} from "@/lib/limitPriceReasoning";
import type { YieldFilterCondition } from "@/lib/dcaYieldFilter";
import { summarizeYieldFilterConditions } from "@/lib/dcaTokenIndicators";

export const YIELD_MIN_ORDER_RSI_THRESHOLD = 38;
export const MIN_ORDER_USD_THRESHOLD = 10;
export const MIN_ORDER_MERGE_SYMBOLS = new Set(["HYPE", "JUP", "SOL"]);
export const CORE_PULLBACK_PCT = 2.5;
export const SAFETY_BRAKE_SMA200_THRESHOLD_PCT = 15;

export type MergedExecutionRoute = "market" | "limit";

export interface SmartRouterInput {
  rsi14: number | null;
  atr14dPct: number | null;
  finalScore: number;
  convictionScore?: number | null;
  priceVsSma14Pct?: number | null;
  ema50DeviationPct?: number | null;
  fundamentalScore?: number | null;
}

export interface MinOrderMergeResult {
  marketUsd: number;
  limitUsd: number;
  marketShare: number;
  limitShare: number;
  minOrderMergeActive: boolean;
  mergedExecutionRoute: MergedExecutionRoute | null;
  mergedTotalUsd: number;
  splitExplanation: string | null;
}

export interface ExecutionMarketContext {
  btc: {
    price: number;
    sma200d: number;
    ema50: number;
    atr14dPct: number;
    rsi14: number;
    distSma200Pct: number;
  };
  eth: { atr14dPct: number; rsi14: number | null };
  sol: { atr14dPct: number; rsi14: number | null };
}

export interface ExecutionTokenInput {
  symbol: string;
  category: AssetCategory;
  finalScore: number;
  fearGreedValue: number;
  spotPrice: number;
  brakeActive: boolean;
  rsi14: number | null;
  atr14dPct: number | null;
  ema50?: number | null;
  distSma200Pct?: number | null;
  filtersPassedCount?: number;
  fundamentalScore?: number;
  filterConditions?: YieldFilterCondition[];
  priceVsSma14Pct?: number | null;
}

export interface ExecutionSplitResult {
  marketShare: number;
  limitShare: number;
  limitPrice: number;
  limitPullbackPct: number;
  whyLimit: string;
  entrySignal: string;
  splitExplanation: string;
  yieldMergeActive: boolean;
  minOrderRuleActive: boolean;
  safetyBrakeActive: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Final Score 0 → 40 % MKT, 100 → 90 % MKT (continuous). */
export function computeBaseMarketPct(finalScore: number): number {
  const clamped = clamp(finalScore, 0, 100);
  return 40 + (clamped / 100) * 50;
}

function limitFromAtr(spot: number, atrPct: number, multiplier: number): number {
  if (spot <= 0) return 0;
  return normalizeLimitPrice(spot * (1 - (multiplier * atrPct) / 100));
}

function buildYieldEntrySignal(input: {
  rsi: number;
  filtersPassed: number;
  fundamental: number;
  filterConditions?: YieldFilterCondition[];
  minOrderRule: boolean;
}): string {
  const filterSummary = summarizeYieldFilterConditions(
    input.filterConditions,
    input.filtersPassed,
  );

  if (input.minOrderRule) {
    return `ENTRY SIGNAL: ${rsiLabel(input.rsi)} (${input.rsi.toFixed(0)}) • MIN ORDER RULE • ${filterSummary}`;
  }

  return `ENTRY SIGNAL: ${rsiLabel(input.rsi)} (${input.rsi.toFixed(0)}) • Momentum OK • ${filterSummary} (skóre ${Math.round(input.fundamental)})`;
}

function rsiLabel(rsi: number): string {
  if (rsi < 30) return "RSI Extreme Oversold";
  if (rsi < 38) return "RSI Oversold";
  if (rsi < 45) return "RSI Soft Oversold";
  if (rsi > 70) return "RSI Overbought";
  return "RSI Neutral";
}

function buildWhyLimit(
  input: ExecutionTokenInput,
  limitPrice: number,
  options?: { atrMultiplier?: number; safetyBrakeActive?: boolean },
): string {
  return buildDynamicLimitReasoning({
    symbol: input.symbol,
    category: input.category,
    spotPrice: input.spotPrice,
    limitPrice,
    rsi14: input.rsi14,
    atr14dPct: input.atr14dPct,
    ema50: input.ema50,
    distSma200Pct: input.distSma200Pct,
    priceVsSma14Pct: input.priceVsSma14Pct,
    fundamentalScore: input.fundamentalScore,
    filtersPassedCount: input.filtersPassedCount,
    fearGreedValue: input.fearGreedValue,
    safetyBrakeActive: options?.safetyBrakeActive ?? input.brakeActive,
    atrMultiplier: options?.atrMultiplier,
  });
}

function resolveCoreLogic(input: ExecutionTokenInput): ExecutionSplitResult {
  const spot = input.spotPrice;
  const ema50 = input.ema50 ?? 0;
  const distSma200 = input.distSma200Pct ?? 0;
  const safetyBrakeActive =
    input.brakeActive || distSma200 >= SAFETY_BRAKE_SMA200_THRESHOLD_PCT;

  let marketShare = computeBaseMarketPct(input.finalScore);

  if (safetyBrakeActive) {
    const brakePenalty = clamp(distSma200 * 0.6, 12, 28);
    marketShare = clamp(marketShare - brakePenalty, 35, 100);
  }

  if (input.fearGreedValue <= 25) {
    marketShare = clamp(marketShare + 6, 0, 100);
  } else if (input.fearGreedValue >= 75) {
    marketShare = clamp(marketShare - 8, 0, 100);
  }

  const pullbackPrice = spot > 0 ? spot * (1 - CORE_PULLBACK_PCT / 100) : 0;
  const rawLimit =
    ema50 > 0 && ema50 < spot
      ? Math.max(ema50, pullbackPrice)
      : pullbackPrice;
  const limitPrice = normalizeLimitPrice(rawLimit);

  const limitPullbackPct = computeBelowSpotPercent(spot, limitPrice);
  const whyLimit = buildWhyLimit(input, limitPrice, { safetyBrakeActive });

  const fgPart =
    input.fearGreedValue <= 30
      ? `Fear & Greed ${Math.round(input.fearGreedValue)} (strach)`
      : input.fearGreedValue >= 70
        ? `Fear & Greed ${Math.round(input.fearGreedValue)} (eufória)`
        : `Fear & Greed ${Math.round(input.fearGreedValue)}`;

  const smaPart =
    distSma200 >= 0
      ? `+${distSma200.toFixed(1)} % nad 200D SMA`
      : `${distSma200.toFixed(1)} % pod 200D SMA`;

  const entrySignal = `ENTRY SIGNAL: ${fgPart} • ${smaPart} • Final Score ${round1(input.finalScore)}`;

  const splitExplanation = safetyBrakeActive
    ? `SPLIT: BTC stav: Safety Brake (+${distSma200.toFixed(1)} % vs 200D SMA) — F&G ${Math.round(input.fearGreedValue)} kontribuuje ${input.fearGreedValue <= 25 ? "+6 % MKT" : input.fearGreedValue >= 75 ? "−8 % MKT" : "neutrálne"} • Limit ${round1(100 - marketShare)} %`
    : `SPLIT: BTC stav: V norme • F&G ${Math.round(input.fearGreedValue)} kontribuuje ${input.fearGreedValue <= 25 ? "+6 % MKT" : input.fearGreedValue >= 75 ? "−8 % MKT" : "neutrálne"} • Core bias ${round1(marketShare)} % MKT / ${round1(100 - marketShare)} % LMT (Final Score ${round1(input.finalScore)})`;

  return {
    marketShare: round1(marketShare),
    limitShare: round1(100 - marketShare),
    limitPrice,
    limitPullbackPct,
    whyLimit,
    entrySignal,
    splitExplanation,
    yieldMergeActive: false,
    minOrderRuleActive: false,
    safetyBrakeActive,
  };
}

function resolveSatelliteLogic(input: ExecutionTokenInput): ExecutionSplitResult {
  const spot = input.spotPrice;
  const rsi = input.rsi14;
  const atrPct = input.atr14dPct;

  if (rsi == null || atrPct == null) {
    const marketShare = computeBaseMarketPct(input.finalScore);
    return {
      marketShare: round1(marketShare),
      limitShare: round1(100 - marketShare),
      limitPrice: 0,
      limitPullbackPct: 0,
      whyLimit: "Čakáme na live RSI/ATR pre výpočet limitného cieľa.",
      entrySignal: `ENTRY SIGNAL: čakáme na live RSI/ATR • Final Score ${round1(input.finalScore)}`,
      splitExplanation: `SPLIT: Satellites — live metriky sa načítavajú (Final Score ${round1(input.finalScore)})`,
      yieldMergeActive: false,
      minOrderRuleActive: false,
      safetyBrakeActive: false,
    };
  }

  let marketShare = computeBaseMarketPct(input.finalScore);

  if (rsi < 40) {
    const oversoldBoost = clamp((40 - rsi) * 0.9, 4, 22);
    marketShare = clamp(marketShare + oversoldBoost, 0, 100);
  } else if (rsi > 65) {
    marketShare = clamp(marketShare - 10, 0, 100);
  }

  const limitPrice = limitFromAtr(spot, atrPct, 1.5);
  const limitPullbackPct = computeBelowSpotPercent(spot, limitPrice);
  const whyLimit = buildWhyLimit(input, limitPrice, { atrMultiplier: 1.5 });

  const entrySignal = `ENTRY SIGNAL: ${rsiLabel(rsi)} (${rsi.toFixed(0)}) • Momentum ${rsi < 50 ? "OK" : "Watch"} • ATR ${atrPct.toFixed(1)} %`;

  const splitExplanation = `SPLIT: Satellites ${round1(marketShare)} % MKT / ${round1(100 - marketShare)} % LMT — Final Score ${round1(input.finalScore)} + RSI ${rsi.toFixed(0)}`;

  return {
    marketShare: round1(marketShare),
    limitShare: round1(100 - marketShare),
    limitPrice,
    limitPullbackPct,
    whyLimit,
    entrySignal,
    splitExplanation,
    yieldMergeActive: false,
    minOrderRuleActive: false,
    safetyBrakeActive: false,
  };
}

function resolveYieldLogic(input: ExecutionTokenInput): ExecutionSplitResult {
  const spot = input.spotPrice;
  const rsi = input.rsi14;
  const atrPct = input.atr14dPct;
  const filtersPassed = input.filtersPassedCount ?? 0;
  const fundamental = input.fundamentalScore ?? 0;
  const minOrderRuleActive =
    rsi != null && rsi < YIELD_MIN_ORDER_RSI_THRESHOLD;

  if (rsi == null || atrPct == null) {
    const marketShare = computeBaseMarketPct(input.finalScore);
    const limitShare = round1(100 - marketShare);
    return {
      marketShare: round1(marketShare),
      limitShare,
      limitPrice: 0,
      limitPullbackPct: 0,
      whyLimit: "Čakáme na live RSI/ATR pre výpočet yield limitného cieľa.",
      entrySignal: `ENTRY SIGNAL: čakáme na live metriky • Fundamentals ${filtersPassed}/3 podmienok`,
      splitExplanation: `SPLIT: Yield — live metriky sa načítavajú (Final Score ${round1(input.finalScore)})`,
      yieldMergeActive: false,
      minOrderRuleActive: false,
      safetyBrakeActive: false,
    };
  }

  if (minOrderRuleActive) {
    const entrySignal = buildYieldEntrySignal({
      rsi,
      filtersPassed,
      fundamental,
      filterConditions: input.filterConditions,
      minOrderRule: true,
    });

    return {
      marketShare: 100,
      limitShare: 0,
      limitPrice: 0,
      limitPullbackPct: 0,
      whyLimit: "",
      entrySignal,
      splitExplanation: `MERGED: MIN ORDER RULE — RSI ${rsi.toFixed(0)} < ${YIELD_MIN_ORDER_RSI_THRESHOLD} ➔ 100 % MARKET (OVERSOLD, KÚP HNEĎ)`,
      yieldMergeActive: true,
      minOrderRuleActive: true,
      safetyBrakeActive: false,
    };
  }

  const marketShare = round1(
    clamp(100 - computeBaseMarketPct(input.finalScore), 15, 70),
  );
  const limitShare = round1(100 - marketShare);
  const limitPrice = limitFromAtr(spot, atrPct, 2.0);
  const limitPullbackPct = computeBelowSpotPercent(spot, limitPrice);
  const whyLimit = buildWhyLimit(input, limitPrice, { atrMultiplier: 2.0 });

  const entrySignal = buildYieldEntrySignal({
    rsi,
    filtersPassed,
    fundamental,
    filterConditions: input.filterConditions,
    minOrderRule: false,
  });

  const splitExplanation = `SPLIT: Yield ${marketShare} % MKT / ${limitShare} % LMT — Final Score ${round1(input.finalScore)} + hlboké limitné knôty (2.0× ATR)`;

  return {
    marketShare,
    limitShare,
    limitPrice,
    limitPullbackPct,
    whyLimit,
    entrySignal,
    splitExplanation,
    yieldMergeActive: false,
    minOrderRuleActive: false,
    safetyBrakeActive: false,
  };
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function buildMinOrderMergeExplanation(
  route: MergedExecutionRoute,
  mergedTotalUsd: number,
): string {
  const routeLabel = route === "market" ? "Market" : "Limit";
  return `MERGED: MIN ORDER RULE (<${MIN_ORDER_USD_THRESHOLD} USD limit) • Zlúčené do ${routeLabel} (Spolu: ${formatCopyAmount2(mergedTotalUsd)} USD)`;
}

/**
 * Smart execution router — evaluates RSI, volatility, score, and MA distance
 * to route a merged order to Market (buy now) or Limit (wait for pullback).
 */
export function evaluateSmartExecutionRoute(
  input: SmartRouterInput,
): MergedExecutionRoute {
  let marketScore = 0;
  let limitScore = 0;

  const rsi = input.rsi14;
  if (rsi != null) {
    if (rsi < 38) marketScore += 3;
    else if (rsi < 45) marketScore += 1;
    else if (rsi > 65) limitScore += 2;
    else if (rsi > 55) limitScore += 1;
  }

  const atr = input.atr14dPct;
  if (atr != null) {
    if (atr >= 6) limitScore += 2;
    else if (atr >= 4) limitScore += 1;
    else marketScore += 1;
  }

  const score = input.convictionScore ?? input.finalScore;
  if (score >= 70) marketScore += 2;
  else if (score >= 55) marketScore += 1;
  else if (score < 40) limitScore += 1;

  const sma14 = input.priceVsSma14Pct;
  if (sma14 != null) {
    if (sma14 <= -3) marketScore += 2;
    else if (sma14 < 0) marketScore += 1;
    else if (sma14 >= 5) limitScore += 2;
    else if (sma14 > 0) limitScore += 1;
  }

  const ema50 = input.ema50DeviationPct;
  if (ema50 != null) {
    if (ema50 <= -5) marketScore += 1;
    else if (ema50 >= 8) limitScore += 1;
  }

  const fundamental = input.fundamentalScore;
  if (fundamental != null) {
    if (fundamental >= 70) marketScore += 1;
    else if (fundamental < 45) limitScore += 1;
  }

  return marketScore >= limitScore ? "market" : "limit";
}

/**
 * Merges sub-minimum Limit legs (< $10) with Market for HYPE, JUP, and SOL.
 * After merge: total < $10 → Market; total ≥ $10 → smart router picks route.
 */
export function applyMinOrderAmountMerge(input: {
  symbol: string;
  marketUsd: number;
  limitUsd: number;
  marketShare: number;
  limitShare: number;
  router: SmartRouterInput;
}): MinOrderMergeResult {
  const passthrough = {
    marketUsd: input.marketUsd,
    limitUsd: input.limitUsd,
    marketShare: input.marketShare,
    limitShare: input.limitShare,
    minOrderMergeActive: false,
    mergedExecutionRoute: null as MergedExecutionRoute | null,
    mergedTotalUsd: 0,
    splitExplanation: null as string | null,
  };

  if (!MIN_ORDER_MERGE_SYMBOLS.has(input.symbol)) {
    return passthrough;
  }

  if (input.limitUsd <= 0 || input.limitUsd >= MIN_ORDER_USD_THRESHOLD) {
    return passthrough;
  }

  const mergedTotalUsd = roundUsd(input.marketUsd + input.limitUsd);

  if (mergedTotalUsd < MIN_ORDER_USD_THRESHOLD) {
    return {
      marketUsd: mergedTotalUsd,
      limitUsd: 0,
      marketShare: 100,
      limitShare: 0,
      minOrderMergeActive: true,
      mergedExecutionRoute: "market",
      mergedTotalUsd,
      splitExplanation: buildMinOrderMergeExplanation("market", mergedTotalUsd),
    };
  }

  const route = evaluateSmartExecutionRoute(input.router);

  if (route === "market") {
    return {
      marketUsd: mergedTotalUsd,
      limitUsd: 0,
      marketShare: 100,
      limitShare: 0,
      minOrderMergeActive: true,
      mergedExecutionRoute: "market",
      mergedTotalUsd,
      splitExplanation: buildMinOrderMergeExplanation("market", mergedTotalUsd),
    };
  }

  return {
    marketUsd: 0,
    limitUsd: mergedTotalUsd,
    marketShare: 0,
    limitShare: 100,
    minOrderMergeActive: true,
    mergedExecutionRoute: "limit",
    mergedTotalUsd,
    splitExplanation: buildMinOrderMergeExplanation("limit", mergedTotalUsd),
  };
}

export function resolveCategoryExecutionSplit(
  input: ExecutionTokenInput,
): ExecutionSplitResult {
  switch (input.category) {
    case "core":
      return resolveCoreLogic(input);
    case "satellite":
      return resolveSatelliteLogic(input);
    case "yield":
      return resolveYieldLogic(input);
    default:
      return resolveSatelliteLogic(input);
  }
}

export function buildExecutionTokenInput(input: {
  symbol: string;
  category: AssetCategory;
  finalScore: number;
  fearGreedValue: number;
  brakeActive: boolean;
  spotPrice: number;
  rsi14: number | null;
  atr14dPct: number | null;
  marketContext?: ExecutionMarketContext | null;
  filtersPassedCount?: number;
  fundamentalScore?: number;
  filterConditions?: YieldFilterCondition[];
  priceVsSma14Pct?: number | null;
}): ExecutionTokenInput {
  const ctx = input.marketContext;

  if (input.category === "core" && ctx) {
    return {
      symbol: input.symbol,
      category: input.category,
      finalScore: input.finalScore,
      fearGreedValue: input.fearGreedValue,
      spotPrice: input.spotPrice || ctx.btc.price,
      brakeActive: input.brakeActive,
      rsi14: ctx.btc.rsi14,
      atr14dPct: ctx.btc.atr14dPct,
      ema50: ctx.btc.ema50,
      distSma200Pct: ctx.btc.distSma200Pct,
    };
  }

  if (input.symbol === "ETH" && ctx) {
    return {
      ...input,
      rsi14: ctx.eth.rsi14 ?? input.rsi14,
      atr14dPct: ctx.eth.atr14dPct ?? input.atr14dPct,
      filterConditions: input.filterConditions,
    };
  }

  if (input.symbol === "SOL" && ctx) {
    return {
      ...input,
      rsi14: ctx.sol.rsi14 ?? input.rsi14,
      atr14dPct: ctx.sol.atr14dPct ?? input.atr14dPct,
      filterConditions: input.filterConditions,
    };
  }

  return {
    ...input,
    filterConditions: input.filterConditions,
  };
}

export function toExecutionMarketContext(
  marketData?: {
    btc: {
      price: number;
      ma200d: number;
      ema50?: number;
      atr14d: number;
      rsi14?: number;
    };
    eth: { atr14d: number; rsi14: number | null };
    sol: { atr14d: number; rsi14: number | null };
  } | null,
): ExecutionMarketContext | null {
  if (!marketData) return null;

  const price = marketData.btc.price;
  const sma200d = marketData.btc.ma200d;
  const distSma200Pct =
    sma200d > 0 ? round1(((price - sma200d) / sma200d) * 100) : 0;

  return {
    btc: {
      price,
      sma200d,
      ema50: marketData.btc.ema50 ?? 0,
      atr14dPct: marketData.btc.atr14d,
      rsi14: marketData.btc.rsi14 ?? 50,
      distSma200Pct,
    },
    eth: {
      atr14dPct: marketData.eth.atr14d,
      rsi14: marketData.eth.rsi14,
    },
    sol: {
      atr14dPct: marketData.sol.atr14d,
      rsi14: marketData.sol.rsi14,
    },
  };
}

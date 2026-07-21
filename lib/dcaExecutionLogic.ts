import type { AssetCategory } from "@/lib/portfolioStorage";
import {
  formatCopyAmount2,
  normalizeLimitPrice,
} from "@/lib/executionFormatting";
import {
  buildDynamicLimitReasoning,
  computeBelowSpotPercent,
} from "@/lib/limitPriceReasoning";
import {
  computeYieldSatelliteMetrics,
  getAtrLimitMultiplier,
  SATELLITE_ATR_LIMIT_MULTIPLIER,
  YIELD_ATR_LIMIT_MULTIPLIER,
} from "@/lib/yieldSatelliteMetrics";
import type { YieldFilterCondition } from "@/lib/dcaYieldFilter";
import { summarizeYieldFilterConditions } from "@/lib/dcaTokenIndicators";
import type { PortfolioYieldContext, ResolvedYieldApy } from "@/lib/yieldDataSources";

export const YIELD_MIN_ORDER_RSI_THRESHOLD = 38;
export const MIN_ORDER_USD_THRESHOLD = 10;
export const MIN_ORDER_MERGE_SYMBOLS = new Set(["HYPE", "JUP", "SOL"]);
export const ROUTER_RSI_MARKET_MIN = 60;
export const ROUTER_RSI_LIMIT_MAX = 45;
export const ROUTER_ATR_LOW_MAX = 4;
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

export interface SmartRouterDecision {
  route: MergedExecutionRoute;
  reasoning: string;
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
  routerReasoning: string | null;
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
  convictionScore?: number | null;
  apyRecord?: ResolvedYieldApy | null;
  portfolioYieldContext?: PortfolioYieldContext | null;
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
  const belowPct = computeBelowSpotPercent(input.spotPrice, limitPrice);
  const atrMultiplier =
    options?.atrMultiplier ?? getAtrLimitMultiplier(input.category);
  const yieldSatelliteMetrics = computeYieldSatelliteMetrics({
    symbol: input.symbol,
    category: input.category,
    atr14dPct: input.atr14dPct,
    fundamentalScore: input.fundamentalScore,
    convictionScore: input.convictionScore,
    limitPullbackPct: belowPct,
    apyRecord: input.apyRecord,
    portfolio: input.portfolioYieldContext,
  });

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
    atrMultiplier,
    yieldSatelliteMetrics,
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

  const limitPrice = limitFromAtr(spot, atrPct, SATELLITE_ATR_LIMIT_MULTIPLIER);
  const limitPullbackPct = computeBelowSpotPercent(spot, limitPrice);
  const whyLimit = buildWhyLimit(input, limitPrice, {
    atrMultiplier: SATELLITE_ATR_LIMIT_MULTIPLIER,
  });

  const entrySignal = `ENTRY SIGNAL: Satellite staking • ATR ${atrPct.toFixed(1)} % • širší pás ${SATELLITE_ATR_LIMIT_MULTIPLIER}×ATR • RSI ${rsi.toFixed(0)}`;

  const splitExplanation = `SPLIT: Satellites ${round1(marketShare)} % MKT / ${round1(100 - marketShare)} % LMT — ${SATELLITE_ATR_LIMIT_MULTIPLIER}×ATR limitný pás (vyššia volatilita)`;

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
  const limitPrice = limitFromAtr(spot, atrPct, YIELD_ATR_LIMIT_MULTIPLIER);
  const limitPullbackPct = computeBelowSpotPercent(spot, limitPrice);
  const whyLimit = buildWhyLimit(input, limitPrice, {
    atrMultiplier: YIELD_ATR_LIMIT_MULTIPLIER,
  });

  const entrySignal = buildYieldEntrySignal({
    rsi,
    filtersPassed,
    fundamental,
    filterConditions: input.filterConditions,
    minOrderRule: false,
  });

  const splitExplanation = `SPLIT: Yield ${marketShare} % MKT / ${limitShare} % LMT — ${YIELD_ATR_LIMIT_MULTIPLIER}×ATR pás pre maximalizáciu nákupu pred auto-kompaundáciou`;

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

function resolveRouterScore(input: SmartRouterInput): number {
  return Math.round(
    input.convictionScore ?? input.fundamentalScore ?? input.finalScore,
  );
}

function formatEma50Label(dev: number | null | undefined): string {
  if (dev == null) return "bez EMA50 dát";
  if (dev > 0) return `${round1(dev)} % nad 50D EMA`;
  if (dev < 0) return `${round1(Math.abs(dev))} % pod 50D EMA`;
  return "na 50D EMA";
}

function qualifiesForMarketRoute(input: SmartRouterInput): boolean {
  const { rsi14, ema50DeviationPct, atr14dPct } = input;
  if (rsi14 == null || ema50DeviationPct == null || atr14dPct == null) {
    return false;
  }
  return (
    rsi14 > ROUTER_RSI_MARKET_MIN &&
    ema50DeviationPct > 0 &&
    atr14dPct < ROUTER_ATR_LOW_MAX
  );
}

function qualifiesForLimitRoute(input: SmartRouterInput): boolean {
  const { rsi14, ema50DeviationPct, atr14dPct } = input;
  if (rsi14 == null || ema50DeviationPct == null || atr14dPct == null) {
    return false;
  }
  return (
    rsi14 < ROUTER_RSI_LIMIT_MAX &&
    ema50DeviationPct <= 0 &&
    atr14dPct >= ROUTER_ATR_LOW_MAX
  );
}

function buildMarketRouterReasoning(input: SmartRouterInput): string {
  const rsi = input.rsi14 ?? 0;
  const atr = input.atr14dPct ?? 0;
  const score = resolveRouterScore(input);
  const emaLabel = formatEma50Label(input.ema50DeviationPct);
  return `Smerované do Marketu: RSI je silné (${rsi.toFixed(0)}), cena drží ${emaLabel}, ATR ${round1(atr)} % (nízka volatilita), skóre ${score} — bez nutnosti čakať na limit.`;
}

function buildLimitRouterReasoning(input: SmartRouterInput): string {
  const rsi = input.rsi14 ?? 0;
  const atr = input.atr14dPct ?? 0;
  const score = resolveRouterScore(input);
  const emaLabel = formatEma50Label(input.ema50DeviationPct);
  return `Smerované do Limitu: RSI je v ochladzovaní (${rsi.toFixed(0)}), cena ${emaLabel}, ATR ${round1(atr)} % (priestor pre pokles), skóre ${score} — čakáme na hlbší limit.`;
}

function buildAutoMarketReasoning(mergedTotalUsd: number): string {
  return `Smerované do Marketu: celková suma ${formatCopyAmount2(mergedTotalUsd)} USD je pod ${MIN_ORDER_USD_THRESHOLD} USD — pod minimálnym limitom, okamžitý nákup v Markete.`;
}

function buildFallbackRouterReasoning(
  input: SmartRouterInput,
  route: MergedExecutionRoute,
): string {
  const rsi = input.rsi14;
  const atr = input.atr14dPct;
  const ema = input.ema50DeviationPct;
  const score = resolveRouterScore(input);
  const emaLabel = formatEma50Label(ema);

  if (route === "market") {
    const rsiPart =
      rsi != null
        ? rsi > ROUTER_RSI_MARKET_MIN
          ? `RSI silné (${rsi.toFixed(0)})`
          : `RSI neutrálne (${rsi.toFixed(0)})`
        : "RSI bez dát";
    const atrPart =
      atr != null
        ? atr < ROUTER_ATR_LOW_MAX
          ? `ATR ${round1(atr)} % (nízka volatilita)`
          : `ATR ${round1(atr)} %`
        : "ATR bez dát";
    return `Smerované do Marketu: ${rsiPart}, cena ${emaLabel}, ${atrPart}, skóre ${score} — indikátory favorizujú okamžitý nákup.`;
  }

  const rsiPart =
    rsi != null
      ? rsi < ROUTER_RSI_LIMIT_MAX
        ? `RSI v ochladzovaní (${rsi.toFixed(0)})`
        : `RSI neutrálne (${rsi.toFixed(0)})`
      : "RSI bez dát";
  const atrPart =
    atr != null
      ? atr >= ROUTER_ATR_LOW_MAX
        ? `ATR ${round1(atr)} % (priestor pre pokles)`
        : `ATR ${round1(atr)} %`
      : "ATR bez dát";
  return `Smerované do Limitu: ${rsiPart}, cena ${emaLabel}, ${atrPart}, skóre ${score} — indikátory favorizujú čakanie na limit.`;
}

function resolveFallbackRoute(input: SmartRouterInput): MergedExecutionRoute {
  let marketVotes = 0;
  let limitVotes = 0;

  const rsi = input.rsi14;
  if (rsi != null) {
    if (rsi > ROUTER_RSI_MARKET_MIN) marketVotes += 2;
    else if (rsi < ROUTER_RSI_LIMIT_MAX) limitVotes += 2;
    else if (rsi >= 50) marketVotes += 1;
    else limitVotes += 1;
  }

  const ema = input.ema50DeviationPct;
  if (ema != null) {
    if (ema > 0) marketVotes += 2;
    else if (ema <= 0) limitVotes += 2;
  }

  const atr = input.atr14dPct;
  if (atr != null) {
    if (atr < ROUTER_ATR_LOW_MAX) marketVotes += 1;
    else limitVotes += 1;
  }

  const score = resolveRouterScore(input);
  if (score >= 60) marketVotes += 1;
  else if (score < 45) limitVotes += 1;

  return marketVotes >= limitVotes ? "market" : "limit";
}

/**
 * Indicator-driven smart router — RSI, 50D EMA, ATR, and score decide
 * Market (buy now) vs Limit (wait for pullback) with cited reasoning.
 */
export function evaluateSmartExecutionRoute(
  input: SmartRouterInput,
): SmartRouterDecision {
  if (qualifiesForMarketRoute(input)) {
    return {
      route: "market",
      reasoning: buildMarketRouterReasoning(input),
    };
  }

  if (qualifiesForLimitRoute(input)) {
    return {
      route: "limit",
      reasoning: buildLimitRouterReasoning(input),
    };
  }

  const route = resolveFallbackRoute(input);
  return {
    route,
    reasoning: buildFallbackRouterReasoning(input, route),
  };
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
    routerReasoning: null as string | null,
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
      routerReasoning: buildAutoMarketReasoning(mergedTotalUsd),
    };
  }

  const decision = evaluateSmartExecutionRoute(input.router);

  if (decision.route === "market") {
    return {
      marketUsd: mergedTotalUsd,
      limitUsd: 0,
      marketShare: 100,
      limitShare: 0,
      minOrderMergeActive: true,
      mergedExecutionRoute: "market",
      mergedTotalUsd,
      splitExplanation: buildMinOrderMergeExplanation("market", mergedTotalUsd),
      routerReasoning: decision.reasoning,
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
    routerReasoning: decision.reasoning,
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
  convictionScore?: number | null;
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

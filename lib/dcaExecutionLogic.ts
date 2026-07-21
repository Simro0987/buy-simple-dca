import type { AssetCategory } from "@/lib/portfolioStorage";
import { normalizeLimitPrice } from "@/lib/executionFormatting";
import type { YieldFilterCondition } from "@/lib/dcaYieldFilter";
import { summarizeYieldFilterConditions } from "@/lib/dcaTokenIndicators";

export const YIELD_MIN_ORDER_RSI_THRESHOLD = 38;
export const CORE_PULLBACK_PCT = 2.5;
export const SAFETY_BRAKE_SMA200_THRESHOLD_PCT = 15;

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

function formatPrice(price: number): string {
  if (price >= 1000) {
    return `$${price.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
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

function pullbackPct(spot: number, limitPrice: number): number {
  if (spot <= 0 || limitPrice <= 0) return 0;
  return round1(((spot - limitPrice) / spot) * 100);
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

function resolveCoreLogic(input: ExecutionTokenInput): ExecutionSplitResult {
  const spot = input.spotPrice;
  const ema50 = input.ema50 ?? 0;
  const distSma200 = input.distSma200Pct ?? 0;
  const aboveEma50 = ema50 > 0 && spot > ema50;
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

  const limitPullbackPct = pullbackPct(spot, limitPrice);
  const emaPosition = aboveEma50 ? "nad" : "pod";

  const whyLimit =
    spot > 0
      ? `BTC je ${emaPosition} 50D EMA. Cielime na ${limitPullbackPct.toFixed(1)} % pullback na ${formatPrice(limitPrice)}, aby nám akumulácia neušla.`
      : "Čakáme na live cenu pre výpočet limitného cieľa.";

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
  const limitPullbackPct = pullbackPct(spot, limitPrice);

  const whyLimit =
    spot > 0
      ? `Cielime na ${limitPullbackPct.toFixed(1)} % pullback na ${formatPrice(limitPrice)} podľa 1.5× ATR (${atrPct.toFixed(1)} %).`
      : "Čakáme na live cenu pre výpočet limitného cieľa.";

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
  const limitPullbackPct = pullbackPct(spot, limitPrice);

  const whyLimit =
    spot > 0
      ? `Yield altcoin — cielime na ${limitPullbackPct.toFixed(1)} % pullback na ${formatPrice(limitPrice)} (Spot − 2.0× ATR ${atrPct.toFixed(1)} %) pre chytenie likvidačných knôtov.`
      : "Čakáme na live cenu pre výpočet limitného cieľa.";

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

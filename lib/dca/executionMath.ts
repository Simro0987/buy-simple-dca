import type {
  BrakeBoostMode,
  DcaCategory,
  ExecutionStatus,
  LimitLeg,
  OhlcvCandle,
} from "@/lib/dca/types";
import { clamp, lerp, roundUsd, smoothstep } from "@/lib/dca/math";

/** Skip LMT2 when its slice would be below this default. User can raise it. */
export const DEFAULT_LMT2_MIN_USD = 20;

/** Limit orders expire after one weekly cycle. */
export const LIMIT_VALIDITY_DAYS = 7;

/**
 * If a limit is unfilled within 7 days by the next weekly cycle,
 * unspent capital rolls into next week's pool.
 */
export const LIMIT_ROLLOVER_NOTE =
  "Nevyplnený limit do 7 dní sa v ďalšom týždennom cykle presúva do nového poolu.";

export interface UniversalExecution {
  mktPercent: number;
  lmtPercent: number;
  mktAmount: number;
  lmtAmount: number;
  limitPrice: number;
  baseTarget: number;
  fallbackActive: boolean;
  targetLabel: string;
  discountPct: number;
}

/** Smooth MKT% from daily RSI 14, clamped to 10–90. */
export function mktPercentFromRsi(rsi: number): number {
  const raw = 90 - (rsi - 30) * 2;
  return Math.max(10, Math.min(90, raw));
}

export function lowestLowLastDays(candles: OhlcvCandle[], days = 7): number {
  const window = candles.slice(-days);
  if (window.length === 0) return 0;
  return Math.min(...window.map((candle) => candle.low));
}

function atrCushion(livePrice: number, atr: number): number {
  if (livePrice <= 0) return 0;
  if (atr > 0) return livePrice - 1.5 * atr;
  // ATR missing would make live − 1.5×ATR == live; keep the limit strictly below.
  return livePrice * 0.985;
}

export function baseLimitTarget(options: {
  category: DcaCategory;
  livePrice: number;
  ema50: number;
  atr: number;
  dailyCandles: OhlcvCandle[];
}): { target: number; label: string } {
  const { category, livePrice, ema50, atr, dailyCandles } = options;
  if (category === "CORE") {
    return { target: ema50, label: "Cieľ: 50D EMA" };
  }
  if (category === "SATELLITE") {
    return {
      target: atrCushion(livePrice, atr),
      label: "Cieľ: Live − 1.5× ATR",
    };
  }
  return {
    target: lowestLowLastDays(dailyCandles, 7),
    label: "Cieľ: S1 · 7d low",
  };
}

export function protectLimitPrice(
  baseTarget: number,
  livePrice: number,
  atr: number,
): { limitPrice: number; fallbackActive: boolean } {
  if (livePrice <= 0) {
    return { limitPrice: 0, fallbackActive: false };
  }
  if (baseTarget > 0 && baseTarget < livePrice) {
    return { limitPrice: baseTarget, fallbackActive: false };
  }
  const fallback = atrCushion(livePrice, atr);
  const limitPrice =
    fallback > 0 && fallback < livePrice ? fallback : livePrice * 0.985;
  return { limitPrice, fallbackActive: true };
}

export function computeUniversalExecution(options: {
  allocatedUsd: number;
  rsi: number;
  category: DcaCategory;
  livePrice: number;
  ema50: number;
  atr: number;
  dailyCandles: OhlcvCandle[];
}): UniversalExecution {
  const mktPercent = mktPercentFromRsi(options.rsi);
  const lmtPercent = 100 - mktPercent;
  const mktAmount = roundUsd(options.allocatedUsd * (mktPercent / 100));
  const lmtAmount = roundUsd(options.allocatedUsd - mktAmount);
  const { target, label } = baseLimitTarget(options);
  const protectedLimit = protectLimitPrice(target, options.livePrice, options.atr);
  const discountPct =
    options.livePrice > 0 && protectedLimit.limitPrice > 0
      ? ((options.livePrice - protectedLimit.limitPrice) / options.livePrice) * 100
      : 0;

  return {
    mktPercent,
    lmtPercent,
    mktAmount,
    lmtAmount,
    limitPrice: protectedLimit.limitPrice,
    baseTarget: target,
    fallbackActive: protectedLimit.fallbackActive,
    targetLabel: label,
    discountPct,
  };
}

export function statusFromRsi(rsi: number): ExecutionStatus {
  if (rsi > 70) return "REDUCE";
  if (rsi < 30) return "DEEP_BOOST";
  return "NORMAL";
}

/** Live distance from 50D EMA, in percent. */
export function emaDistancePercent(livePrice: number, ema50: number): number {
  if (livePrice <= 0 || ema50 <= 0) return 0;
  return ((livePrice - ema50) / ema50) * 100;
}

export interface BrakeBoostResult {
  mode: BrakeBoostMode;
  emaDistancePercent: number;
  factor: number;
  originalMktAmount: number;
  finalMktAmount: number;
  reserveDelta: number;
  badge: string;
  matrixLabel: string;
}

const idleBrakeBoost = (originalMktAmount: number): BrakeBoostResult => ({
  mode: "NORMAL",
  emaDistancePercent: 0,
  factor: 0,
  originalMktAmount,
  finalMktAmount: originalMktAmount,
  reserveDelta: 0,
  badge: "",
  matrixLabel: "BRZDA & BOOST: NORMÁLNE",
});

/**
 * Phase 7: adjust only the Phase 6 MKT amount from 50D EMA distance.
 * LMT is never touched. Saved MKT goes to Dostupný Kapitál; extra MKT
 * is deducted from that pool — never redirected to BTC.
 */
export function applyBrakeBoost(
  originalMktAmount: number,
  livePrice: number,
  ema50: number,
): BrakeBoostResult {
  const original = roundUsd(Math.max(0, originalMktAmount));
  if (original <= 0 || livePrice <= 0 || ema50 <= 0) {
    return idleBrakeBoost(original);
  }

  const distance = emaDistancePercent(livePrice, ema50);
  if (distance > 0) {
    const reductionFactor = Math.min(100, distance * 2);
    const finalMktAmount = roundUsd(original * (1 - reductionFactor / 100));
    const remainingPct = 100 - reductionFactor;
    return {
      mode: "REDUCE",
      emaDistancePercent: distance,
      factor: reductionFactor,
      originalMktAmount: original,
      finalMktAmount,
      reserveDelta: roundUsd(original - finalMktAmount),
      badge: `REDUCE (-${reductionFactor.toFixed(0)}%)`,
      matrixLabel: `BRZDA & BOOST: REDUCE MKT × ${remainingPct.toFixed(0)}%`,
    };
  }

  if (distance < 0) {
    const boostFactor = Math.abs(distance) * 2;
    const multiplier = Math.min(2.0, 1 + boostFactor / 100);
    const finalMktAmount = roundUsd(original * multiplier);
    const mode: BrakeBoostMode = multiplier >= 1.5 ? "DEEP_BOOST" : "BOOST";
    const label = mode === "DEEP_BOOST" ? "DEEP BOOST" : "BOOST";
    return {
      mode,
      emaDistancePercent: distance,
      factor: multiplier,
      originalMktAmount: original,
      finalMktAmount,
      reserveDelta: roundUsd(original - finalMktAmount),
      badge: `${label} (MKT × ${(multiplier * 100).toFixed(0)}%)`,
      matrixLabel: `BRZDA & BOOST: ${label} MKT × ${(multiplier * 100).toFixed(0)}%`,
    };
  }

  return idleBrakeBoost(original);
}

export interface LimitLadderLeg {
  usd: number;
  price: number;
  atrMult: number;
  label: string;
  fallbackActive: boolean;
  baseTarget: number;
  discountPct: number;
}

export interface LimitLadder {
  lmt2Share: number;
  lmt2Skipped: boolean;
  skipReason: string;
  atrPct: number;
  lmt1: LimitLadderLeg;
  lmt2: LimitLadderLeg;
}

function emptyLeg(): LimitLadderLeg {
  return {
    usd: 0,
    price: 0,
    atrMult: 0,
    label: "",
    fallbackActive: false,
    baseTarget: 0,
    discountPct: 0,
  };
}

/** ATR% → smooth LMT1 / LMT2 distance multipliers. Low vol tightens; high vol widens. */
export function atrMultipliers(atrPct: number): { k1: number; k2: number } {
  const t = smoothstep(1, 7, Number.isFinite(atrPct) ? atrPct : 3);
  return {
    k1: lerp(0.85, 1.9, t),
    k2: lerp(2.1, 4, t),
  };
}

/** Share of LMT capital sent to the deep wick (LMT2). Continuous in RSI + ATR%. */
export function lmt2ShareFromIndicators(rsi: number, atrPct: number): number {
  const rsiTerm = smoothstep(32, 78, rsi);
  const volTerm = smoothstep(1.3, 6.2, Number.isFinite(atrPct) ? atrPct : 3);
  return clamp(0.1, 0.7, 0.16 + rsiTerm * 0.32 + volTerm * 0.26);
}

function discountPct(livePrice: number, limitPrice: number): number {
  if (!(livePrice > 0) || !(limitPrice > 0)) return 0;
  return ((livePrice - limitPrice) / livePrice) * 100;
}

function makeLeg(
  usd: number,
  livePrice: number,
  atr: number,
  atrMult: number,
  baseTarget: number,
  label: string,
): LimitLadderLeg {
  const protectedLimit = protectLimitPrice(baseTarget, livePrice, atr);
  return {
    usd: roundUsd(usd),
    price: protectedLimit.limitPrice,
    atrMult,
    label,
    fallbackActive: protectedLimit.fallbackActive,
    baseTarget,
    discountPct: discountPct(livePrice, protectedLimit.limitPrice),
  };
}

export function computeLimitLadder(options: {
  lmtAmount: number;
  rsi: number;
  category: DcaCategory;
  livePrice: number;
  ema50: number;
  sma200: number;
  atr: number;
  dailyCandles: OhlcvCandle[];
  minLmt2Usd: number;
}): LimitLadder {
  const live = options.livePrice;
  const atr = options.atr;
  const atrPct = live > 0 && atr > 0 ? (atr / live) * 100 : Number.NaN;
  const { k1, k2 } = atrMultipliers(atrPct);
  const share = lmt2ShareFromIndicators(options.rsi, atrPct);
  const total = Math.max(0, roundUsd(options.lmtAmount));
  const minUsd = Math.max(0, options.minLmt2Usd);
  const atr1 = live > 0 ? live - k1 * Math.max(atr, live * 0.008) : 0;
  const atr2 = live > 0 ? live - k2 * Math.max(atr, live * 0.008) : 0;

  let lmt1Base = atr1;
  let lmt1Label = `LMT1 · Live − ${k1.toFixed(2)}× ATR`;
  let lmt2Base = atr2;
  let lmt2Label = `LMT2 · Live − ${k2.toFixed(2)}× ATR`;

  if (options.category === "CORE") {
    const ema = options.ema50 > 0 && options.ema50 < live ? options.ema50 : atr1;
    lmt1Base = Math.max(atr1, ema);
    lmt1Label = `LMT1 · 50D EMA / ${k1.toFixed(2)}× ATR`;
    const sma = options.sma200 > 0 && options.sma200 < live ? options.sma200 : atr2;
    lmt2Base = Math.min(atr2, sma);
    lmt2Label = `LMT2 · 200D SMA / ${k2.toFixed(2)}× ATR`;
  } else if (options.category === "HIGH_BETA") {
    const weekLow = lowestLowLastDays(options.dailyCandles, 7);
    lmt1Base = weekLow > 0 ? Math.max(atr1, weekLow) : atr1;
    lmt1Label = `LMT1 · 7d low / ${k1.toFixed(2)}× ATR`;
    lmt2Base = weekLow > 0 ? Math.min(atr2, weekLow) : atr2;
    lmt2Label = `LMT2 · 7d wick / ${k2.toFixed(2)}× ATR`;
  }

  if (lmt2Base >= lmt1Base && lmt1Base > 0) {
    lmt2Base = lmt1Base * 0.985;
  }

  let lmt2Usd = roundUsd(total * share);
  let skipped = false;
  let skipReason = "";
  if (total <= 0) {
    lmt2Usd = 0;
  } else if (lmt2Usd < minUsd) {
    skipped = true;
    skipReason = `LMT2 ${lmt2Usd.toFixed(0)}$ pod minimom ${minUsd.toFixed(0)}$ · 100% ide do LMT1`;
    lmt2Usd = 0;
  }
  const lmt1Usd = roundUsd(total - lmt2Usd);
  const lmt1 = makeLeg(lmt1Usd, live, atr, k1, lmt1Base, lmt1Label);
  const lmt2 = skipped
    ? { ...emptyLeg(), atrMult: k2, label: skipReason }
    : makeLeg(lmt2Usd, live, atr, k2, lmt2Base, lmt2Label);

  return {
    lmt2Share: skipped ? 0 : share,
    lmt2Skipped: skipped,
    skipReason,
    atrPct: Number.isFinite(atrPct) ? atrPct : 0,
    lmt1,
    lmt2,
  };
}

export function limitUsdForLeg(ladder: LimitLadder, leg: LimitLeg): number {
  return leg === "lmt2" ? ladder.lmt2.usd : ladder.lmt1.usd;
}

export function limitPriceForLeg(ladder: LimitLadder, leg: LimitLeg): number {
  return leg === "lmt2" ? ladder.lmt2.price : ladder.lmt1.price;
}

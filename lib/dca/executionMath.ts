import type {
  BrakeBoostMode,
  DcaCategory,
  ExecutionStatus,
  OhlcvCandle,
} from "@/lib/dca/types";
import { roundUsd } from "@/lib/dca/math";

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
 * LMT is never touched. Saved MKT goes to Hotovosť rezerva; extra MKT
 * is deducted from that reserve — never redirected to BTC.
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

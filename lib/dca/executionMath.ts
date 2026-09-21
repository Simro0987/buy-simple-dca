import { clamp, lerp, sigmoid, smoothstep } from "@/lib/dca/math";
import type { ExecutionStatus } from "@/lib/dca/types";

/**
 * Continuous MKT share from RSI.
 * RSI 20 → ~100% market; RSI 80 → ~20% market. Smoothstep, no step jumps.
 */
export function marketShareFromRsi(rsi: number, moneyMode: boolean): number {
  const t = smoothstep(20, 80, rsi);
  const minShare = moneyMode ? 28 : 20;
  const maxShare = moneyMode ? 100 : 96;
  return lerp(maxShare, minShare, t);
}

/**
 * Limit discount scales smoothly with ATR-distance of price from 50D EMA.
 * Price below EMA → larger discount; extended above → tiny discount.
 */
export function limitDiscountFromTrend(
  price: number,
  ema50: number,
  atr: number,
): number {
  if (price <= 0 || ema50 <= 0) return 0.012;
  const atrSafe = atr > 0 ? atr : ema50 * 0.02;
  const atrDistance = (ema50 - price) / atrSafe;
  const t = sigmoid(atrDistance / 1.35);
  return lerp(0.004, 0.038, t);
}

export function statusFromRsi(rsi: number): ExecutionStatus {
  if (rsi > 70) return "REDUCE";
  if (rsi < 30) return "DEEP_BOOST";
  return "NORMAL";
}

export function clampPercent(value: number): number {
  return clamp(value, 0, 100);
}

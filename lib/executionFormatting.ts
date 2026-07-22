/** Clipboard-friendly amounts and limit prices (SK comma style). */

import { formatDecimal } from "@/lib/numberFormat";

export { formatCopyAmount4, formatCopyAmount2 } from "@/lib/numberFormat";

/**
 * Rounds to 4 decimal places and ensures the 4th digit is 1–9 (never 0).
 * Uses +0.0001 tick bump when the rounded value would end in 0.
 */
export function normalizeLimitPrice(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;

  let ticks = Math.round(value * 10000);
  if (ticks <= 0) return 0.0001;

  if (ticks % 10 === 0) {
    ticks += 1;
  }

  return ticks / 10000;
}

/**
 * Limit_Price = Spot × (1 − Final_Discount / 100).
 * Final_Discount = 0 → limit equals spot (never zero when spot > 0).
 */
export function computeLimitPriceFromDiscount(
  spotPrice: number,
  discountPct: number,
): number {
  if (!Number.isFinite(spotPrice) || spotPrice <= 0) return 0;
  const discount = Number.isFinite(discountPct) ? Math.max(0, discountPct) : 0;
  return normalizeLimitPrice(spotPrice * (1 - discount / 100));
}

/**
 * Ensures a valid, non-zero exchange limit price.
 * Falls back to spot when the computed value is 0, undefined, or NaN.
 */
export function resolveSafeLimitPrice(
  spotPrice: number,
  limitPrice: number | null | undefined,
): number {
  if (
    limitPrice != null &&
    Number.isFinite(limitPrice) &&
    limitPrice > 0
  ) {
    return normalizeLimitPrice(limitPrice);
  }

  return computeLimitPriceFromDiscount(spotPrice, 0);
}

/**
 * Limit purchase price — exactly 4 decimal places, comma separator,
 * 4th decimal digit always 1–9.
 */
export function formatCopyLimitPrice4(
  value: number,
  spotFallback?: number,
): string {
  const resolved =
    value > 0 && Number.isFinite(value)
      ? value
      : spotFallback != null && spotFallback > 0
        ? resolveSafeLimitPrice(spotFallback, null)
        : 0;

  if (resolved <= 0) return "—";

  const normalized = normalizeLimitPrice(resolved);
  return formatDecimal(normalized, 4);
}

/** @deprecated Use formatNumber4 from @/lib/numberFormat */
export { formatNumber4 as formatCopyLimitPrice } from "@/lib/numberFormat";

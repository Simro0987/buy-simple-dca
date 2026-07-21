/** Clipboard-friendly amounts and limit prices (SK comma style). */

import {
  formatCopyAmount4,
  formatDecimal,
  formatNumber4,
} from "@/lib/numberFormat";

export { formatCopyAmount4, formatCopyAmount2 } from "@/lib/numberFormat";

/**
 * Rounds to 4 decimal places and ensures the 4th digit is 1–9 (never 0).
 * Uses +0.0001 tick bump when the rounded value would end in 0.
 */
export function normalizeLimitPrice(value: number): number {
  if (value <= 0) return 0;

  let ticks = Math.round(value * 10000);
  if (ticks <= 0) return 0.0001;

  if (ticks % 10 === 0) {
    ticks += 1;
  }

  return ticks / 10000;
}

/**
 * Limit purchase price — exactly 4 decimal places, comma separator,
 * 4th decimal digit always 1–9.
 */
export function formatCopyLimitPrice4(value: number): string {
  if (value <= 0) return "0,0000";

  const normalized = normalizeLimitPrice(value);
  return formatDecimal(normalized, 4);
}

/** @deprecated Use formatNumber4 */
export const formatCopyLimitPrice = formatNumber4;

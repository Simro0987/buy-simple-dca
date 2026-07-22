/** Slovak-style decimal comma formatting for the app UI. */

export function formatDecimal(
  value: number,
  fractionDigits: number,
  useGrouping = false,
): string {
  return new Intl.NumberFormat("sk-SK", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping,
  }).format(value);
}

/** Generic number with exactly 4 decimal places (e.g. 65188,6462). */
export function formatNumber4(value: number): string {
  return formatDecimal(value, 4);
}

/**
 * Money sums and capital allocations — exactly 2 decimals (e.g. $119,13).
 * Use for Market/Limit amounts, weekly budget, deployed capital, etc.
 */
export function formatUsd(
  value: number,
  options?: { showSign?: boolean },
): string {
  const formatted = `$${formatDecimal(Math.abs(value), 2)}`;

  if (options?.showSign && value > 0) return `+${formatted}`;
  if (options?.showSign && value < 0) return `-${formatted}`;
  return formatted;
}

/**
 * Spot / limit token unit price — exactly 4 decimals (e.g. $65188,6462).
 */
export function formatUnitPrice(value: number): string {
  if (value <= 0) return "$0,0000";
  return `$${formatDecimal(value, 4)}`;
}

/** Percentage with comma separator (default 1 decimal, e.g. -8,5%). */
export function formatPct(value: number, fractionDigits = 1): string {
  return `${formatDecimal(value, fractionDigits)}%`;
}

/** Signed percentage (e.g. +2,7%, -8,5%). */
export function formatSignedPct(value: number, fractionDigits = 1): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${formatDecimal(value, fractionDigits)}%`;
}

/** RSI display — always 1 decimal with comma (e.g. 60,8). */
export function formatRsi(value: number): string {
  return formatDecimal(value, 1);
}

/** Multiplier display (e.g. 1,45×). */
export function formatMultiplier(value: number, fractionDigits = 2): string {
  return `${formatDecimal(value, fractionDigits)}×`;
}

/** Clipboard-friendly purchase sum — 2 decimals, no currency symbol (e.g. 119,13). */
export function formatCopyAmount2(value: number): string {
  return formatDecimal(Math.max(0, value), 2);
}

/** Clipboard-friendly price — 4 decimals, no currency symbol (e.g. 65188,6462). */
export function formatCopyAmount4(value: number): string {
  return formatDecimal(Math.max(0, value), 4);
}

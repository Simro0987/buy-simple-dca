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

/** USD amount with $ prefix and 4 decimal places (e.g. $65188,6462). */
export function formatUsd(
  value: number,
  options?: { showSign?: boolean },
): string {
  const formatted = `$${formatDecimal(Math.abs(value), 4)}`;

  if (options?.showSign && value > 0) return `+${formatted}`;
  if (options?.showSign && value < 0) return `-${formatted}`;
  return formatted;
}

/** Spot / limit unit price — 4 decimals, comma separator. */
export function formatUnitPrice(value: number): string {
  return formatUsd(value);
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

/** Multiplier display (e.g. 1,45×). */
export function formatMultiplier(value: number, fractionDigits = 2): string {
  return `${formatDecimal(value, fractionDigits)}×`;
}

/** Clipboard-friendly amount — 4 decimals, no currency symbol. */
export function formatCopyAmount4(value: number): string {
  return formatDecimal(Math.max(0, value), 4);
}

/** @deprecated Use formatCopyAmount4 */
export const formatCopyAmount2 = formatCopyAmount4;

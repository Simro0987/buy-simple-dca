/** Clipboard-friendly amounts with comma decimal separator (SK style). */

function formatDecimal(value: number, fractionDigits: number): string {
  return new Intl.NumberFormat("sk-SK", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
    useGrouping: false,
  }).format(value);
}

/** Market / Limit purchase sum — exactly 2 decimal places, comma separator. */
export function formatCopyAmount2(value: number): string {
  return formatDecimal(Math.max(0, value), 2);
}

/**
 * Limit purchase price — comma separator, trailing zeros trimmed.
 * - BTC-scale (≥1000): up to 2 decimals, omit fraction if zero (e.g. 1827,5 not 1827,0000)
 * - Altcoins (<1000): 2–4 decimals, only non-zero digits kept (e.g. 0,0845)
 */
export function formatCopyLimitPrice4(value: number): string {
  const v = Math.max(0, value);
  if (v === 0) return "0";

  const maxDecimals = v >= 1000 ? 2 : 4;
  const minDecimals = v >= 1000 ? 0 : 2;

  const [intPart, rawFrac = ""] = v.toFixed(maxDecimals).split(".");
  let fracPart = rawFrac.replace(/0+$/, "");

  if (fracPart.length < minDecimals) {
    fracPart = fracPart.padEnd(minDecimals, "0");
  }

  if (fracPart.length === 0) {
    return intPart;
  }

  return `${intPart},${fracPart}`;
}

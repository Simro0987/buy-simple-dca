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

/** Limit purchase price — exactly 4 decimal places, comma separator. */
export function formatCopyLimitPrice4(value: number): string {
  return formatDecimal(Math.max(0, value), 4);
}

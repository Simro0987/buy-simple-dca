import { clamp, lerp, mapRange, roundUsd } from "@/lib/dca/math";
import type { DcaSymbol, SmartTrimAdvice } from "@/lib/dca/types";

export const SMART_TRIM_CONFLUENCE = 85;
export const SMART_TRIM_RSI = 85;

export function recommendSmartTrim(options: {
  confluence: number;
  rsi: number;
  symbol: DcaSymbol;
  price: number;
  holdingQty: number;
  forced?: boolean;
}): SmartTrimAdvice | null {
  const hot =
    options.forced ||
    (options.confluence > SMART_TRIM_CONFLUENCE && options.rsi > SMART_TRIM_RSI);
  if (!hot || !(options.price > 0)) return null;

  const stretch = Math.max(
    options.confluence - SMART_TRIM_CONFLUENCE,
    options.rsi - SMART_TRIM_RSI,
  );
  const trimPercent = Math.round(clamp(lerp(5, 10, mapRange(stretch, 0, 12, 0, 1)), 5, 10) * 10) / 10;
  const qty = Math.max(0, options.holdingQty) * (trimPercent / 100);
  const usd = roundUsd(qty * options.price);
  const qtyLabel =
    options.symbol === "BTC"
      ? qty.toFixed(6)
      : options.symbol === "ETH"
        ? qty.toFixed(4)
        : qty.toFixed(3);

  return {
    active: true,
    trimPercent,
    qty,
    usd,
    headline: "SMART TRIM: Návrh na výber ziskov",
    detail: `Odporúča sa odpredať ${trimPercent.toFixed(0)} % pozície = ${qtyLabel} ${options.symbol} v hodnote $${usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}.`,
  };
}

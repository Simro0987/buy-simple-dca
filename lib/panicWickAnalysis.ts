import type { OhlcBar } from "@/lib/market-data/fetchKlines";
import { normalizeLimitPrice } from "@/lib/executionFormatting";
import { formatDecimal } from "@/lib/numberFormat";

export const PANIC_WICK_LOOKBACK_DAYS = 30;

/** Matches 7-day ATR guardrail in limitDepthEngine — kept local to avoid circular imports. */
const ATR_GUARDRAIL_MULTIPLIER = 1.5;

export interface PanicWickStats {
  averagePanicWickPct: number | null;
  redDayCount: number;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/**
 * Red-day lower wick depth: Min(Open, Close) − Low, as % of body bottom.
 * Only candles where Close < Open (bearish / red days).
 */
export function computePanicWickStats(
  bars: OhlcBar[],
  lookback = PANIC_WICK_LOOKBACK_DAYS,
): PanicWickStats {
  const window = bars.slice(-lookback);
  const wickPcts: number[] = [];

  for (const bar of window) {
    if (bar.close >= bar.open) continue;

    const bodyBottom = Math.min(bar.open, bar.close);
    if (bodyBottom <= 0 || bar.low >= bodyBottom) continue;

    const lowerWick = bodyBottom - bar.low;
    const wickPct = (lowerWick / bodyBottom) * 100;
    if (wickPct > 0) wickPcts.push(wickPct);
  }

  if (wickPcts.length === 0) {
    return { averagePanicWickPct: null, redDayCount: 0 };
  }

  const average =
    wickPcts.reduce((sum, value) => sum + value, 0) / wickPcts.length;

  return {
    averagePanicWickPct: round1(average),
    redDayCount: wickPcts.length,
  };
}

function atrGuardrailFloor(spotPrice: number, atr14dPct: number): number {
  if (spotPrice <= 0 || atr14dPct <= 0) return 0;
  return normalizeLimitPrice(
    spotPrice *
      (1 - (ATR_GUARDRAIL_MULTIPLIER * atr14dPct) / 100),
  );
}

export function resolvePanicWickLimit(input: {
  spotPrice: number;
  averagePanicWickPct: number;
  atr14dPct: number;
}): {
  limitPrice: number;
  atrGuardrailApplied: boolean;
  pullbackPct: number;
} {
  const rawLimit = normalizeLimitPrice(
    input.spotPrice * (1 - input.averagePanicWickPct / 100),
  );
  const guardrail = atrGuardrailFloor(input.spotPrice, input.atr14dPct);
  const atrGuardrailApplied = guardrail > 0 && rawLimit < guardrail;
  const limitPrice =
    atrGuardrailApplied && guardrail > 0 ? guardrail : rawLimit;

  const pullbackPct =
    input.spotPrice > 0
      ? round1(((input.spotPrice - limitPrice) / input.spotPrice) * 100)
      : 0;

  return { limitPrice, atrGuardrailApplied, pullbackPct };
}

export function buildPanicWickNarrative(input: {
  averagePanicWickPct: number;
  redDayCount: number;
  atrGuardrailApplied: boolean;
}): string {
  const depth = formatDecimal(input.averagePanicWickPct, 1);

  let text =
    `Analýza za posledných ${PANIC_WICK_LOOKBACK_DAYS} dní ukazuje, že v červených dňoch ` +
    `tento token vytvára panické knoty o priemernej hĺbke ${depth} % ` +
    `(vzorka: ${input.redDayCount} červených dní). ` +
    "Limitná cena je nastavená presne na túto štatistickú úroveň.";

  if (input.atrGuardrailApplied) {
    text +=
      ` Historický panický knot bol príliš hlboký — limit zastropovaný ` +
      `7-dňovým ATR mantinelom (${formatDecimal(ATR_GUARDRAIL_MULTIPLIER, 1)}×ATR14).`;
  }

  return text;
}

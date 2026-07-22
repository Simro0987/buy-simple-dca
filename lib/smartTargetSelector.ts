import { normalizeLimitPrice } from "@/lib/executionFormatting";
import { formatDecimal } from "@/lib/numberFormat";

/** 7-day fill feasibility cap — matches limitDepthEngine guardrail. */
export const SMART_TARGET_ATR_CAP_MULTIPLIER = 1.5;

export type SmartTargetSource = "s2" | "panic_wick";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function discountPct(spotPrice: number, limitPrice: number): number {
  if (spotPrice <= 0 || limitPrice <= 0) return 0;
  return round1(((spotPrice - limitPrice) / spotPrice) * 100);
}

function atrGuardrailCapPct(atr14dPct: number): number {
  if (atr14dPct <= 0) return 0;
  return round1(SMART_TARGET_ATR_CAP_MULTIPLIER * atr14dPct);
}

function atrGuardrailFloor(spotPrice: number, atr14dPct: number): number {
  if (spotPrice <= 0 || atr14dPct <= 0) return 0;
  return normalizeLimitPrice(
    spotPrice *
      (1 - (SMART_TARGET_ATR_CAP_MULTIPLIER * atr14dPct) / 100),
  );
}

export interface SmartTargetSelection {
  s2DiscountPct: number | null;
  panicWickDiscountPct: number | null;
  optimalDiscountPct: number;
  selectedSource: SmartTargetSource;
  limitPrice: number;
  atrGuardrailApplied: boolean;
  atrGuardrailCapPct: number;
}

/**
 * Compare S2 vs panic wick per token; pick the deeper discount, capped at 1.5×ATR.
 */
export function resolveSmartFallbackTarget(input: {
  spotPrice: number;
  atr14dPct: number;
  s2Limit: number;
  averagePanicWickPct: number | null;
  minDiscountPct: number;
}): SmartTargetSelection | null {
  if (input.spotPrice <= 0 || input.atr14dPct <= 0) return null;

  const capPct = atrGuardrailCapPct(input.atr14dPct);
  const guardrailPrice = atrGuardrailFloor(input.spotPrice, input.atr14dPct);

  const options: Array<{
    source: SmartTargetSource;
    discountPct: number;
    price: number;
  }> = [];

  if (input.s2Limit > 0 && input.s2Limit < input.spotPrice) {
    const discountPctValue = discountPct(input.spotPrice, input.s2Limit);
    options.push({
      source: "s2",
      discountPct: discountPctValue,
      price: input.s2Limit,
    });
  }

  if (input.averagePanicWickPct != null && input.averagePanicWickPct > 0) {
    const panicPrice = normalizeLimitPrice(
      input.spotPrice * (1 - input.averagePanicWickPct / 100),
    );
    const discountPctValue = discountPct(input.spotPrice, panicPrice);
    options.push({
      source: "panic_wick",
      discountPct: discountPctValue,
      price: panicPrice,
    });
  }

  if (options.length === 0) return null;

  const winner = options.reduce((best, candidate) =>
    candidate.discountPct > best.discountPct ? candidate : best,
  );

  let optimalDiscountPct = winner.discountPct;
  let limitPrice = winner.price;
  let atrGuardrailApplied = false;

  if (capPct > 0 && optimalDiscountPct > capPct) {
    optimalDiscountPct = capPct;
    limitPrice = guardrailPrice > 0 ? guardrailPrice : limitPrice;
    atrGuardrailApplied = true;
  }

  if (optimalDiscountPct < input.minDiscountPct) {
    return null;
  }

  return {
    s2DiscountPct:
      input.s2Limit > 0 && input.s2Limit < input.spotPrice
        ? discountPct(input.spotPrice, input.s2Limit)
        : null,
    panicWickDiscountPct:
      input.averagePanicWickPct != null && input.averagePanicWickPct > 0
        ? round1(input.averagePanicWickPct)
        : null,
    optimalDiscountPct,
    selectedSource: winner.source,
    limitPrice,
    atrGuardrailApplied,
    atrGuardrailCapPct: capPct,
  };
}

export function buildSmartTargetNarrative(selection: SmartTargetSelection): string {
  const s2Text =
    selection.s2DiscountPct != null
      ? `${formatDecimal(selection.s2DiscountPct, 1)} %`
      : "—";
  const panicText =
    selection.panicWickDiscountPct != null
      ? `${formatDecimal(selection.panicWickDiscountPct, 1)} %`
      : "—";
  const optimal = formatDecimal(selection.optimalDiscountPct, 1);
  const winnerLabel =
    selection.selectedSource === "panic_wick" ? "Panický knot" : "S2";

  let text =
    `Systém porovnal S2 (${s2Text}) a Panický knot (${panicText}). ` +
    `Ako limit bola zvolená lepšia možnosť (${winnerLabel}, ${optimal} %)`;

  if (selection.atrGuardrailApplied) {
    text +=
      `, ktorá je zastropovaná max. povolenou volatilitou pre 7-dňový príkaz ` +
      `(${formatDecimal(selection.atrGuardrailCapPct, 1)} % = ${formatDecimal(SMART_TARGET_ATR_CAP_MULTIPLIER, 1)}×ATR).`;
  } else {
    text += ", ktorá poskytuje hlbšiu zľavu pre tento token.";
  }

  return text;
}

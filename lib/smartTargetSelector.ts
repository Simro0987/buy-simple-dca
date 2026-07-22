import { computeLimitPriceFromDiscount } from "@/lib/executionFormatting";
import { formatDecimal } from "@/lib/numberFormat";

/** 7-day fill feasibility cap — matches limitDepthEngine guardrail. */
export const SMART_TARGET_ATR_CAP_MULTIPLIER = 1.5;

export type SmartTargetSource = "s2" | "panic_wick";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round0(value: number): number {
  return Math.round(value);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function discountPct(spotPrice: number, limitPrice: number): number {
  if (spotPrice <= 0 || limitPrice <= 0) return 0;
  return round1(((spotPrice - limitPrice) / spotPrice) * 100);
}

export function atrGuardrailCapPct(atr14dPct: number): number {
  if (atr14dPct <= 0) return 0;
  return round1(SMART_TARGET_ATR_CAP_MULTIPLIER * atr14dPct);
}

export interface SmoothDiscountBlend {
  s1DiscountPct: number;
  s1Weight: number;
  s1WeightPct: number;
  deepWeightPct: number;
  s2DiscountPct: number | null;
  panicWickDiscountPct: number | null;
  deepTargetPct: number;
  deepTargetSource: SmartTargetSource | null;
  finalDiscountPct: number;
  limitPrice: number;
  noiseThresholdPct: number;
  atrGuardrailCapPct: number;
  atrGuardrailApplied: boolean;
}

/** @deprecated Use SmoothDiscountBlend via resolveSmoothDiscountBlend */
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
 * Smooth S1 ↔ deep-target blend — no hard IF/ELSE jumps.
 * S1_Weight = clamp(S1_Discount / Final_Noise_Threshold, 0, 1)
 * Final_Discount = S1_Weight × S1 + (1 - S1_Weight) × Deep_Target
 */
export function resolveSmoothDiscountBlend(input: {
  spotPrice: number;
  atr14dPct: number;
  s1Limit: number;
  s2Limit: number;
  averagePanicWickPct: number | null;
  noiseThresholdPct: number;
}): SmoothDiscountBlend | null {
  if (input.spotPrice <= 0 || input.atr14dPct <= 0) return null;

  const capPct = atrGuardrailCapPct(input.atr14dPct);
  const s1DiscountPct =
    input.s1Limit > 0 && input.s1Limit < input.spotPrice
      ? discountPct(input.spotPrice, input.s1Limit)
      : 0;

  const s2DiscountPct =
    input.s2Limit > 0 && input.s2Limit < input.spotPrice
      ? discountPct(input.spotPrice, input.s2Limit)
      : null;

  const panicWickDiscountPct =
    input.averagePanicWickPct != null && input.averagePanicWickPct > 0
      ? round1(input.averagePanicWickPct)
      : null;

  let rawDeepPct = 0;
  let deepTargetSource: SmartTargetSource | null = null;

  if (s2DiscountPct != null && panicWickDiscountPct != null) {
    if (panicWickDiscountPct >= s2DiscountPct) {
      rawDeepPct = panicWickDiscountPct;
      deepTargetSource = "panic_wick";
    } else {
      rawDeepPct = s2DiscountPct;
      deepTargetSource = "s2";
    }
  } else if (s2DiscountPct != null) {
    rawDeepPct = s2DiscountPct;
    deepTargetSource = "s2";
  } else if (panicWickDiscountPct != null) {
    rawDeepPct = panicWickDiscountPct;
    deepTargetSource = "panic_wick";
  } else {
    rawDeepPct = s1DiscountPct;
  }

  const atrGuardrailApplied = capPct > 0 && rawDeepPct > capPct;
  const deepTargetPct =
    capPct > 0 ? round1(Math.min(rawDeepPct, capPct)) : round1(rawDeepPct);

  const threshold =
    input.noiseThresholdPct > 0 ? input.noiseThresholdPct : 0.01;
  const s1Weight = clamp01(s1DiscountPct / threshold);
  const deepWeight = 1 - s1Weight;

  const finalDiscountPct = round1(
    s1Weight * s1DiscountPct + deepWeight * deepTargetPct,
  );
  const limitPrice = computeLimitPriceFromDiscount(
    input.spotPrice,
    finalDiscountPct,
  );

  return {
    s1DiscountPct,
    s1Weight,
    s1WeightPct: round0(s1Weight * 100),
    deepWeightPct: round0(deepWeight * 100),
    s2DiscountPct,
    panicWickDiscountPct,
    deepTargetPct,
    deepTargetSource,
    finalDiscountPct,
    limitPrice,
    noiseThresholdPct: input.noiseThresholdPct,
    atrGuardrailCapPct: capPct,
    atrGuardrailApplied,
  };
}

export function buildSmoothBlendNarrative(blend: SmoothDiscountBlend): string {
  const s1 = formatDecimal(blend.s1DiscountPct, 1);
  const deep = formatDecimal(blend.deepTargetPct, 1);
  const final = formatDecimal(blend.finalDiscountPct, 1);
  const deepLabel =
    blend.deepTargetSource === "panic_wick" ? "Panický knot" : "S2";

  let text =
    `Plynulý prechod: váha zľavy ${blend.s1WeightPct} % S1 (${s1} %) + ` +
    `${blend.deepWeightPct} % hlboký cieľ (${deepLabel}, ${deep} %). ` +
    `Finálna zľava ${final} %.`;

  if (blend.atrGuardrailApplied) {
    text +=
      ` Hlboký cieľ je zastropovaný na ${formatDecimal(blend.atrGuardrailCapPct, 1)} % ` +
      `(1,5×ATR) pre 7-dňovú realizovateľnosť.`;
  }

  return text;
}

/** @deprecated Use resolveSmoothDiscountBlend */
export function resolveSmartFallbackTarget(input: {
  spotPrice: number;
  atr14dPct: number;
  s2Limit: number;
  averagePanicWickPct: number | null;
  minDiscountPct: number;
}): SmartTargetSelection | null {
  const blend = resolveSmoothDiscountBlend({
    spotPrice: input.spotPrice,
    atr14dPct: input.atr14dPct,
    s1Limit: 0,
    s2Limit: input.s2Limit,
    averagePanicWickPct: input.averagePanicWickPct,
    noiseThresholdPct: input.minDiscountPct,
  });
  if (!blend || blend.deepTargetSource == null) return null;
  if (blend.deepTargetPct < input.minDiscountPct) return null;

  return {
    s2DiscountPct: blend.s2DiscountPct,
    panicWickDiscountPct: blend.panicWickDiscountPct,
    optimalDiscountPct: blend.deepTargetPct,
    selectedSource: blend.deepTargetSource,
    limitPrice: blend.limitPrice,
    atrGuardrailApplied: blend.atrGuardrailApplied,
    atrGuardrailCapPct: blend.atrGuardrailCapPct,
  };
}

/** @deprecated Use buildSmoothBlendNarrative */
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

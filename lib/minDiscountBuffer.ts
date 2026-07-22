import { normalizeLimitPrice } from "@/lib/executionFormatting";
import { formatDecimal } from "@/lib/numberFormat";
import { resolvePanicWickLimit } from "@/lib/panicWickAnalysis";

/** Matches 7-day ATR guardrail in limitDepthEngine. */
const ATR_GUARDRAIL_MULTIPLIER = 1.5;

/** Noise zone = this fraction of daily ATR (e.g. 0.3 × ATR14%). */
export const NOISE_ATR_FRACTION = 0.3;

export type MinDiscountFallbackSource = "s2" | "panic_wick";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeDiscountPct(spotPrice: number, limitPrice: number): number {
  if (spotPrice <= 0 || limitPrice <= 0) return 0;
  return round1(((spotPrice - limitPrice) / spotPrice) * 100);
}

/** Dynamic noise threshold: 30 % of the token's typical daily range. */
export function computeNoiseThresholdPct(atr14dPct: number): number {
  if (atr14dPct <= 0) return 0;
  return round1(NOISE_ATR_FRACTION * atr14dPct);
}

export function isSupportInNoiseZone(input: {
  spotPrice: number;
  supportPrice: number;
  atr14dPct: number;
}): boolean {
  if (input.supportPrice <= 0 || input.supportPrice >= input.spotPrice) {
    return false;
  }
  const discountPct = computeDiscountPct(input.spotPrice, input.supportPrice);
  const noiseThreshold = computeNoiseThresholdPct(input.atr14dPct);
  return discountPct < noiseThreshold;
}

function atrGuardrailFloor(spotPrice: number, atr14dPct: number): number {
  if (spotPrice <= 0 || atr14dPct <= 0) return 0;
  return normalizeLimitPrice(
    spotPrice *
      (1 - (ATR_GUARDRAIL_MULTIPLIER * atr14dPct) / 100),
  );
}

export function buildMinDiscountFallbackNarrative(input: {
  atr14dPct: number;
  noiseThresholdPct: number;
  s1DiscountPct: number;
  newDiscountPct: number;
  fallbackSource: MinDiscountFallbackSource;
}): string {
  const levelLabel =
    input.fallbackSource === "panic_wick" ? "panický knot" : "S2";
  const atr = formatDecimal(input.atr14dPct, 1);
  const noise = formatDecimal(input.noiseThresholdPct, 1);
  const s1 = formatDecimal(input.s1DiscountPct, 1);
  const target = formatDecimal(input.newDiscountPct, 1);

  return (
    `Najbližší support bol vyhodnotený ako bežný cenový šum vzhľadom na vysokú volatilitu ` +
    `(ATR ${atr} %, zóna šumu ${noise} %) tohto tokenu — S1 bol len ${s1} % pod spotom. ` +
    `Systém zvolil hlbšiu zľavu na úrovni ${levelLabel} (${target} % pod spotom), ` +
    "adekvátnu volatilite tokenu."
  );
}

export function applyMinDiscountBuffer(input: {
  spotPrice: number;
  limitPrice: number;
  atr14dPct: number;
  s1Limit: number;
  s2Limit: number;
  averagePanicWickPct?: number | null;
}): {
  limitPrice: number;
  fallbackApplied: boolean;
  fallbackSource: MinDiscountFallbackSource | null;
  originalDiscountPct: number;
  s1DiscountPct: number;
  noiseThresholdPct: number;
  discountPct: number;
  narrative: string | null;
  atrGuardrailApplied: boolean;
} {
  const noiseThresholdPct = computeNoiseThresholdPct(input.atr14dPct);
  const originalDiscountPct = computeDiscountPct(
    input.spotPrice,
    input.limitPrice,
  );
  const s1DiscountPct =
    input.s1Limit > 0
      ? computeDiscountPct(input.spotPrice, input.s1Limit)
      : originalDiscountPct;

  const s1InNoiseZone = isSupportInNoiseZone({
    spotPrice: input.spotPrice,
    supportPrice: input.s1Limit,
    atr14dPct: input.atr14dPct,
  });

  const limitInNoiseZone = originalDiscountPct < noiseThresholdPct;

  if (!s1InNoiseZone && !limitInNoiseZone) {
    return {
      limitPrice: input.limitPrice,
      fallbackApplied: false,
      fallbackSource: null,
      originalDiscountPct,
      s1DiscountPct,
      noiseThresholdPct,
      discountPct: originalDiscountPct,
      narrative: null,
      atrGuardrailApplied: false,
    };
  }

  const guardrail = atrGuardrailFloor(input.spotPrice, input.atr14dPct);
  const candidates: Array<{
    price: number;
    source: MinDiscountFallbackSource;
    discountPct: number;
  }> = [];

  if (input.s2Limit > 0 && input.s2Limit < input.spotPrice) {
    const discountPct = computeDiscountPct(input.spotPrice, input.s2Limit);
    if (discountPct >= noiseThresholdPct) {
      candidates.push({
        price: input.s2Limit,
        source: "s2",
        discountPct,
      });
    }
  }

  if (input.averagePanicWickPct != null && input.averagePanicWickPct > 0) {
    const panic = resolvePanicWickLimit({
      spotPrice: input.spotPrice,
      averagePanicWickPct: input.averagePanicWickPct,
      atr14dPct: input.atr14dPct,
    });
    const discountPct = computeDiscountPct(input.spotPrice, panic.limitPrice);
    if (discountPct >= noiseThresholdPct) {
      candidates.push({
        price: panic.limitPrice,
        source: "panic_wick",
        discountPct,
      });
    }
  }

  const aboveGuardrail = candidates.filter(
    (candidate) => guardrail <= 0 || candidate.price >= guardrail,
  );

  if (aboveGuardrail.length > 0) {
    const best = aboveGuardrail.reduce((deepest, candidate) =>
      candidate.price < deepest.price ? candidate : deepest,
    );

    return {
      limitPrice: best.price,
      fallbackApplied: true,
      fallbackSource: best.source,
      originalDiscountPct,
      s1DiscountPct,
      noiseThresholdPct,
      discountPct: best.discountPct,
      narrative: buildMinDiscountFallbackNarrative({
        atr14dPct: input.atr14dPct,
        noiseThresholdPct,
        s1DiscountPct,
        newDiscountPct: best.discountPct,
        fallbackSource: best.source,
      }),
      atrGuardrailApplied: false,
    };
  }

  if (guardrail > 0 && guardrail < input.spotPrice) {
    const guardrailDiscount = computeDiscountPct(input.spotPrice, guardrail);
    return {
      limitPrice: guardrail,
      fallbackApplied: true,
      fallbackSource: "s2",
      originalDiscountPct,
      s1DiscountPct,
      noiseThresholdPct,
      discountPct: guardrailDiscount,
      narrative: buildMinDiscountFallbackNarrative({
        atr14dPct: input.atr14dPct,
        noiseThresholdPct,
        s1DiscountPct,
        newDiscountPct: guardrailDiscount,
        fallbackSource: "s2",
      }),
      atrGuardrailApplied: true,
    };
  }

  return {
    limitPrice: input.limitPrice,
    fallbackApplied: false,
    fallbackSource: null,
    originalDiscountPct,
    s1DiscountPct,
    noiseThresholdPct,
    discountPct: originalDiscountPct,
    narrative: null,
    atrGuardrailApplied: false,
  };
}

import { normalizeLimitPrice } from "@/lib/executionFormatting";
import { formatDecimal } from "@/lib/numberFormat";
import { resolvePanicWickLimit } from "@/lib/panicWickAnalysis";

/** Matches 7-day ATR guardrail in limitDepthEngine. */
const ATR_GUARDRAIL_MULTIPLIER = 1.5;

/** Limits closer than this % below spot are treated as noise. */
export const MIN_DISCOUNT_BUFFER_PCT = 2.0;

/** Target minimum discount after S2 / panic-wick fallback. */
export const FALLBACK_TARGET_DISCOUNT_PCT = 2.5;

export type MinDiscountFallbackSource = "s2" | "panic_wick";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeDiscountPct(spotPrice: number, limitPrice: number): number {
  if (spotPrice <= 0 || limitPrice <= 0) return 0;
  return round1(((spotPrice - limitPrice) / spotPrice) * 100);
}

function atrGuardrailFloor(spotPrice: number, atr14dPct: number): number {
  if (spotPrice <= 0 || atr14dPct <= 0) return 0;
  return normalizeLimitPrice(
    spotPrice *
      (1 - (ATR_GUARDRAIL_MULTIPLIER * atr14dPct) / 100),
  );
}

export function buildMinDiscountFallbackNarrative(input: {
  originalDiscountPct: number;
  newDiscountPct: number;
  fallbackSource: MinDiscountFallbackSource;
}): string {
  const original = formatDecimal(input.originalDiscountPct, 1);
  const target = formatDecimal(input.newDiscountPct, 1);
  const levelLabel =
    input.fallbackSource === "panic_wick" ? "panický knot" : "S2";

  return (
    `Najbližší S1 support bol príliš blízko (len ${original} % pod spotom), čo je v kryptách len cenový šum. ` +
    `Systém automaticky posunul limitnú cenu na hlbšiu úroveň ${levelLabel} (${target} % pod spotom), ` +
    "aby zabezpečil reálnu nákupnú zľavu."
  );
}

export function applyMinDiscountBuffer(input: {
  spotPrice: number;
  limitPrice: number;
  atr14dPct: number;
  s2Limit: number;
  averagePanicWickPct?: number | null;
}): {
  limitPrice: number;
  fallbackApplied: boolean;
  fallbackSource: MinDiscountFallbackSource | null;
  originalDiscountPct: number;
  discountPct: number;
  narrative: string | null;
  atrGuardrailApplied: boolean;
} {
  const originalDiscountPct = computeDiscountPct(
    input.spotPrice,
    input.limitPrice,
  );

  if (originalDiscountPct >= MIN_DISCOUNT_BUFFER_PCT) {
    return {
      limitPrice: input.limitPrice,
      fallbackApplied: false,
      fallbackSource: null,
      originalDiscountPct,
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
    if (discountPct >= MIN_DISCOUNT_BUFFER_PCT) {
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
    if (discountPct >= MIN_DISCOUNT_BUFFER_PCT) {
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

  const preferred = aboveGuardrail.filter(
    (candidate) => candidate.discountPct >= FALLBACK_TARGET_DISCOUNT_PCT,
  );
  const pool = preferred.length > 0 ? preferred : aboveGuardrail;

  if (pool.length > 0) {
    const best = pool.reduce((deepest, candidate) =>
      candidate.price < deepest.price ? candidate : deepest,
    );

    return {
      limitPrice: best.price,
      fallbackApplied: true,
      fallbackSource: best.source,
      originalDiscountPct,
      discountPct: best.discountPct,
      narrative: buildMinDiscountFallbackNarrative({
        originalDiscountPct,
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
      discountPct: guardrailDiscount,
      narrative: buildMinDiscountFallbackNarrative({
        originalDiscountPct,
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
    discountPct: originalDiscountPct,
    narrative: null,
    atrGuardrailApplied: false,
  };
}

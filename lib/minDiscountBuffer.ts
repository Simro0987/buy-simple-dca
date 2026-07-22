import { normalizeLimitPrice } from "@/lib/executionFormatting";
import { formatDecimal, formatRsi } from "@/lib/numberFormat";
import { resolvePanicWickLimit } from "@/lib/panicWickAnalysis";
import type { MacroTrend } from "@/lib/macroTrend";
import type { ShortTermTrend } from "@/lib/shortTermTrend";

/** Matches 7-day ATR guardrail in limitDepthEngine. */
const ATR_GUARDRAIL_MULTIPLIER = 1.5;

/** Hard stop — no limit may sit closer than this discount below spot. */
export const ABSOLUTE_MIN_DISCOUNT_FLOOR_PCT = 1.5;

/** Default neutral noise multiplier (30 % of ATR). */
export const NOISE_MULTIPLIER_NEUTRAL = 0.3;

export const NOISE_MULTIPLIER_STRONG_BULL = 0.15;
export const NOISE_MULTIPLIER_BEAR = 0.5;

export type NoiseTrendRegime = "strong_bull" | "neutral" | "bear";

export type MinDiscountFallbackSource = "s2" | "panic_wick";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function computeDiscountPct(spotPrice: number, limitPrice: number): number {
  if (spotPrice <= 0 || limitPrice <= 0) return 0;
  return round1(((spotPrice - limitPrice) / spotPrice) * 100);
}

export function resolveNoiseTrendRegime(input: {
  spotPrice: number;
  sma200?: number | null;
  ema21?: number | null;
  rsi14?: number | null;
  shortTermTrend?: ShortTermTrend | null;
  macroTrend?: MacroTrend | null;
}): NoiseTrendRegime {
  const aboveSma200 =
    input.sma200 != null &&
    input.sma200 > 0 &&
    input.spotPrice > input.sma200;
  const aboveEma21 =
    input.ema21 != null &&
    input.ema21 > 0 &&
    input.spotPrice > input.ema21;
  const belowSma200 =
    input.sma200 != null &&
    input.sma200 > 0 &&
    input.spotPrice < input.sma200;

  const fallingRsi =
    input.rsi14 != null &&
    (input.shortTermTrend === "bear" || input.rsi14 < 50);

  if (belowSma200 && (fallingRsi || input.macroTrend === "bear")) {
    return "bear";
  }

  if (aboveSma200 && aboveEma21) {
    return "strong_bull";
  }

  if (input.shortTermTrend === "sideways") {
    return "neutral";
  }

  return "neutral";
}

export function resolveNoiseMultiplier(regime: NoiseTrendRegime): number {
  switch (regime) {
    case "strong_bull":
      return NOISE_MULTIPLIER_STRONG_BULL;
    case "bear":
      return NOISE_MULTIPLIER_BEAR;
    default:
      return NOISE_MULTIPLIER_NEUTRAL;
  }
}

/** Trend-adjusted noise threshold before the absolute floor: Multiplier × ATR14%. */
export function computeTrendAdjustedNoiseThresholdPct(
  atr14dPct: number,
  regime: NoiseTrendRegime = "neutral",
): number {
  if (atr14dPct <= 0) return 0;
  return round1(resolveNoiseMultiplier(regime) * atr14dPct);
}

/** Final noise threshold: MAX(Trend_Adjusted_Noise, Absolute_Floor). */
export function computeNoiseThresholdPct(
  atr14dPct: number,
  regime: NoiseTrendRegime = "neutral",
): number {
  const trendAdjusted = computeTrendAdjustedNoiseThresholdPct(atr14dPct, regime);
  return round1(
    Math.max(trendAdjusted, ABSOLUTE_MIN_DISCOUNT_FLOOR_PCT),
  );
}

export function isAbsoluteDiscountFloorActive(
  atr14dPct: number,
  regime: NoiseTrendRegime = "neutral",
): boolean {
  const trendAdjusted = computeTrendAdjustedNoiseThresholdPct(atr14dPct, regime);
  return trendAdjusted < ABSOLUTE_MIN_DISCOUNT_FLOOR_PCT;
}

export interface DiscountLogicBreakdown {
  atr14dPct: number;
  noiseTrendRegime: NoiseTrendRegime;
  trendMultiplier: number;
  trendMultiplierLabel: string;
  dynamicNoisePct: number;
  finalDiscountPct: number;
  absoluteFloorActive: boolean;
  s1DistancePct: number;
  s1Accepted: boolean;
}

export function formatNoiseTrendRegimeLabel(regime: NoiseTrendRegime): string {
  switch (regime) {
    case "strong_bull":
      return "Bull";
    case "bear":
      return "Bear";
    default:
      return "Neutrál";
  }
}

export function computeDiscountLogicBreakdown(input: {
  spotPrice: number;
  atr14dPct: number | null;
  s1LimitPrice: number;
  sma200?: number | null;
  ema21?: number | null;
  rsi14?: number | null;
  shortTermTrend?: ShortTermTrend | null;
  macroTrend?: MacroTrend | null;
}): DiscountLogicBreakdown | null {
  if (
    input.spotPrice <= 0 ||
    input.atr14dPct == null ||
    input.atr14dPct <= 0
  ) {
    return null;
  }

  const noiseTrendRegime = resolveNoiseTrendRegime({
    spotPrice: input.spotPrice,
    sma200: input.sma200,
    ema21: input.ema21,
    rsi14: input.rsi14,
    shortTermTrend: input.shortTermTrend,
    macroTrend: input.macroTrend,
  });
  const trendMultiplier = resolveNoiseMultiplier(noiseTrendRegime);
  const dynamicNoisePct = computeTrendAdjustedNoiseThresholdPct(
    input.atr14dPct,
    noiseTrendRegime,
  );
  const finalDiscountPct = computeNoiseThresholdPct(
    input.atr14dPct,
    noiseTrendRegime,
  );
  const s1DistancePct =
    input.s1LimitPrice > 0 && input.s1LimitPrice < input.spotPrice
      ? computeDiscountPct(input.spotPrice, input.s1LimitPrice)
      : 0;

  return {
    atr14dPct: round1(input.atr14dPct),
    noiseTrendRegime,
    trendMultiplier,
    trendMultiplierLabel: formatNoiseTrendRegimeLabel(noiseTrendRegime),
    dynamicNoisePct,
    finalDiscountPct,
    absoluteFloorActive: isAbsoluteDiscountFloorActive(
      input.atr14dPct,
      noiseTrendRegime,
    ),
    s1DistancePct,
    s1Accepted: s1DistancePct >= finalDiscountPct,
  };
}

function absoluteDiscountFloorPrice(spotPrice: number): number {
  if (spotPrice <= 0) return 0;
  return normalizeLimitPrice(
    spotPrice * (1 - ABSOLUTE_MIN_DISCOUNT_FLOOR_PCT / 100),
  );
}

function enforceAbsoluteDiscountFloor(
  spotPrice: number,
  limitPrice: number,
): {
  limitPrice: number;
  discountPct: number;
  applied: boolean;
} {
  const floorPrice = absoluteDiscountFloorPrice(spotPrice);
  const discountPct = computeDiscountPct(spotPrice, limitPrice);

  if (
    floorPrice <= 0 ||
    limitPrice <= 0 ||
    limitPrice <= floorPrice ||
    discountPct >= ABSOLUTE_MIN_DISCOUNT_FLOOR_PCT
  ) {
    return { limitPrice, discountPct, applied: false };
  }

  return {
    limitPrice: floorPrice,
    discountPct: ABSOLUTE_MIN_DISCOUNT_FLOOR_PCT,
    applied: true,
  };
}

export function isSupportInNoiseZone(input: {
  spotPrice: number;
  supportPrice: number;
  atr14dPct: number;
  regime?: NoiseTrendRegime;
}): boolean {
  if (input.supportPrice <= 0 || input.supportPrice >= input.spotPrice) {
    return false;
  }
  const discountPct = computeDiscountPct(input.spotPrice, input.supportPrice);
  const noiseThreshold = computeNoiseThresholdPct(
    input.atr14dPct,
    input.regime ?? "neutral",
  );
  return discountPct < noiseThreshold;
}

function atrGuardrailFloor(spotPrice: number, atr14dPct: number): number {
  if (spotPrice <= 0 || atr14dPct <= 0) return 0;
  return normalizeLimitPrice(
    spotPrice *
      (1 - (ATR_GUARDRAIL_MULTIPLIER * atr14dPct) / 100),
  );
}

function formatMultiplierPct(multiplier: number): string {
  return formatDecimal(multiplier * 100, 0);
}

export function buildMinDiscountFallbackNarrative(input: {
  atr14dPct: number;
  noiseThresholdPct: number;
  noiseTrendRegime: NoiseTrendRegime;
  noiseMultiplier: number;
  s1DiscountPct: number;
  newDiscountPct: number;
  fallbackSource: MinDiscountFallbackSource;
  rsi14?: number | null;
  absoluteFloorApplied?: boolean;
}): string {
  const levelLabel =
    input.fallbackSource === "panic_wick" ? "panický knot" : "S2";
  const target = formatDecimal(input.newDiscountPct, 1);

  if (input.absoluteFloorApplied) {
    return (
      "Volatilita tokenu je aktuálne extrémne nízka. Systém aplikoval pravidlo absolútneho minima " +
      `(${formatDecimal(ABSOLUTE_MIN_DISCOUNT_FLOOR_PCT, 1)} %) a posunul limit na hlbšiu úroveň ` +
      `(${levelLabel}, ${target} % pod spotom), aby zabezpečil aspoň základnú nákupnú zľavu.`
    );
  }

  const multPct = formatMultiplierPct(input.noiseMultiplier);

  if (input.noiseTrendRegime === "bear") {
    return (
      `Vzhľadom na silný Bear trend systém vyžaduje výraznejšiu zľavu ` +
      `(min. ${multPct} % bežnej volatility, prah ${formatDecimal(input.noiseThresholdPct, 1)} %). ` +
      "Plytké supporty boli ignorované pre minimalizáciu rizika. " +
      `Limitná cena bola posunutá na ${levelLabel} (${target} % pod spotom).`
    );
  }

  if (input.noiseTrendRegime === "strong_bull") {
    return (
      `V silnom Bull trende (cena nad SMA 200 aj EMA 21) systém akceptuje aj menšie korekcie ` +
      `(zóna šumu ${formatDecimal(input.noiseThresholdPct, 1)} % = ${multPct} % ATR). ` +
      `Najbližší support (${formatDecimal(input.s1DiscountPct, 1)} % pod spotom) bol napriek tomu príliš plytký — ` +
      `limit posunutý na ${levelLabel} (${target} % pod spotom).`
    );
  }

  const atr = formatDecimal(input.atr14dPct, 1);
  const noise = formatDecimal(input.noiseThresholdPct, 1);
  const s1 = formatDecimal(input.s1DiscountPct, 1);
  const rsiText =
    input.rsi14 != null ? ` RSI ${formatRsi(input.rsi14)}.` : "";

  return (
    `Najbližší support bol vyhodnotený ako bežný cenový šum vzhľadom na volatilitu tokenu ` +
    `(ATR ${atr} %, neutrálna zóna šumu ${noise} % = ${multPct} % ATR).${rsiText} ` +
    `S1 bol len ${s1} % pod spotom — systém zvolil hlbšiu zľavu na ${levelLabel} (${target} %).`
  );
}

export function applyMinDiscountBuffer(input: {
  spotPrice: number;
  limitPrice: number;
  atr14dPct: number;
  s1Limit: number;
  s2Limit: number;
  sma200?: number | null;
  ema21?: number | null;
  rsi14?: number | null;
  shortTermTrend?: ShortTermTrend | null;
  macroTrend?: MacroTrend | null;
  averagePanicWickPct?: number | null;
}): {
  limitPrice: number;
  fallbackApplied: boolean;
  fallbackSource: MinDiscountFallbackSource | null;
  originalDiscountPct: number;
  s1DiscountPct: number;
  noiseThresholdPct: number;
  noiseTrendRegime: NoiseTrendRegime;
  noiseMultiplier: number;
  discountPct: number;
  narrative: string | null;
  atrGuardrailApplied: boolean;
  absoluteFloorApplied: boolean;
} {
  const noiseTrendRegime = resolveNoiseTrendRegime({
    spotPrice: input.spotPrice,
    sma200: input.sma200,
    ema21: input.ema21,
    rsi14: input.rsi14,
    shortTermTrend: input.shortTermTrend,
    macroTrend: input.macroTrend,
  });
  const noiseMultiplier = resolveNoiseMultiplier(noiseTrendRegime);
  const noiseThresholdPct = computeNoiseThresholdPct(
    input.atr14dPct,
    noiseTrendRegime,
  );
  const absoluteFloorActive = isAbsoluteDiscountFloorActive(
    input.atr14dPct,
    noiseTrendRegime,
  );

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
    regime: noiseTrendRegime,
  });

  const limitInNoiseZone = originalDiscountPct < noiseThresholdPct;

  const narrativeInput = {
    atr14dPct: input.atr14dPct,
    noiseThresholdPct,
    noiseTrendRegime,
    noiseMultiplier,
    s1DiscountPct,
    rsi14: input.rsi14,
    absoluteFloorApplied: absoluteFloorActive,
  };

  const buildResult = (result: {
    limitPrice: number;
    fallbackApplied: boolean;
    fallbackSource: MinDiscountFallbackSource | null;
    atrGuardrailApplied: boolean;
    narrative?: string | null;
  }) => {
    const enforced = enforceAbsoluteDiscountFloor(
      input.spotPrice,
      result.limitPrice,
    );
    const fallbackApplied = result.fallbackApplied || enforced.applied;
    const narrative = enforced.applied
      ? buildMinDiscountFallbackNarrative({
          ...narrativeInput,
          absoluteFloorApplied: true,
          newDiscountPct: enforced.discountPct,
          fallbackSource: result.fallbackSource ?? "s2",
        })
      : (result.narrative ?? null);

    return {
      limitPrice: enforced.limitPrice,
      fallbackApplied,
      fallbackSource: result.fallbackSource,
      originalDiscountPct,
      s1DiscountPct,
      noiseThresholdPct,
      noiseTrendRegime,
      noiseMultiplier,
      discountPct: enforced.discountPct,
      narrative,
      atrGuardrailApplied: result.atrGuardrailApplied,
      absoluteFloorApplied: absoluteFloorActive || enforced.applied,
    };
  };

  if (!s1InNoiseZone && !limitInNoiseZone) {
    return buildResult({
      limitPrice: input.limitPrice,
      fallbackApplied: false,
      fallbackSource: null,
      atrGuardrailApplied: false,
    });
  }

  const guardrail = atrGuardrailFloor(input.spotPrice, input.atr14dPct);
  const absoluteFloor = absoluteDiscountFloorPrice(input.spotPrice);
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

    return buildResult({
      limitPrice: best.price,
      fallbackApplied: true,
      fallbackSource: best.source,
      atrGuardrailApplied: false,
      narrative: buildMinDiscountFallbackNarrative({
        ...narrativeInput,
        newDiscountPct: best.discountPct,
        fallbackSource: best.source,
      }),
    });
  }

  if (guardrail > 0 && guardrail < input.spotPrice) {
    const effectiveGuardrail =
      absoluteFloor > 0 && guardrail > absoluteFloor
        ? absoluteFloor
        : guardrail;
    const guardrailDiscount = computeDiscountPct(
      input.spotPrice,
      effectiveGuardrail,
    );
    return buildResult({
      limitPrice: effectiveGuardrail,
      fallbackApplied: true,
      fallbackSource: "s2",
      atrGuardrailApplied: effectiveGuardrail === guardrail,
      narrative: buildMinDiscountFallbackNarrative({
        ...narrativeInput,
        newDiscountPct: guardrailDiscount,
        fallbackSource: "s2",
      }),
    });
  }

  if (absoluteFloor > 0 && absoluteFloor < input.spotPrice) {
    const floorDiscount = computeDiscountPct(input.spotPrice, absoluteFloor);
    return buildResult({
      limitPrice: absoluteFloor,
      fallbackApplied: true,
      fallbackSource: "s2",
      atrGuardrailApplied: false,
      narrative: buildMinDiscountFallbackNarrative({
        ...narrativeInput,
        absoluteFloorApplied: true,
        newDiscountPct: floorDiscount,
        fallbackSource: "s2",
      }),
    });
  }

  return buildResult({
    limitPrice: input.limitPrice,
    fallbackApplied: false,
    fallbackSource: null,
    atrGuardrailApplied: false,
  });
}

/** @deprecated Use NOISE_MULTIPLIER_NEUTRAL */
export const NOISE_ATR_FRACTION = NOISE_MULTIPLIER_NEUTRAL;

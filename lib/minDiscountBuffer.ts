import { normalizeLimitPrice } from "@/lib/executionFormatting";
import { formatDecimal, formatRsi } from "@/lib/numberFormat";
import { SNAP_ABOVE_SUPPORT_PCT } from "@/lib/supportResistanceLevels";
import type { MacroTrend } from "@/lib/macroTrend";
import type { ShortTermTrend } from "@/lib/shortTermTrend";
import {
  buildSmartTargetNarrative,
  resolveSmartFallbackTarget,
  type SmartTargetSelection,
} from "@/lib/smartTargetSelector";

/** Matches 7-day ATR guardrail in limitDepthEngine. */
const ATR_GUARDRAIL_MULTIPLIER = 1.5;

/** Token min floor scales with each coin's ATR: 0.5 × ATR14%. */
export const TOKEN_MIN_FLOOR_ATR_FRACTION = 0.5;

/** @deprecated Use TOKEN_MIN_FLOOR_ATR_FRACTION + computeTokenMinFloorPct */
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

/** Trend-adjusted dynamic noise: Multiplier × ATR14%. */
export function computeTrendAdjustedNoiseThresholdPct(
  atr14dPct: number,
  regime: NoiseTrendRegime = "neutral",
): number {
  if (atr14dPct <= 0) return 0;
  return round1(resolveNoiseMultiplier(regime) * atr14dPct);
}

/** ATR-scaled component of the per-token minimum: 0.5 × ATR14%. */
export function computeTokenAtrScaledMinFloorPct(atr14dPct: number): number {
  if (atr14dPct <= 0) return 0;
  return round1(TOKEN_MIN_FLOOR_ATR_FRACTION * atr14dPct);
}

/** Per-token minimum discount: max(Dynamic_Noise, 0.5 × ATR). */
export function computeTokenMinFloorPct(
  atr14dPct: number,
  regime: NoiseTrendRegime = "neutral",
): number {
  const dynamicNoise = computeTrendAdjustedNoiseThresholdPct(atr14dPct, regime);
  const atrScaledMin = computeTokenAtrScaledMinFloorPct(atr14dPct);
  return round1(Math.max(dynamicNoise, atrScaledMin));
}

/** Final noise threshold — alias for per-token min floor. */
export function computeNoiseThresholdPct(
  atr14dPct: number,
  regime: NoiseTrendRegime = "neutral",
): number {
  return computeTokenMinFloorPct(atr14dPct, regime);
}

export function isTokenMinFloorBinding(
  atr14dPct: number,
  regime: NoiseTrendRegime = "neutral",
): boolean {
  const dynamicNoise = computeTrendAdjustedNoiseThresholdPct(atr14dPct, regime);
  const atrScaledMin = computeTokenAtrScaledMinFloorPct(atr14dPct);
  return atrScaledMin > dynamicNoise;
}

/** @deprecated Use isTokenMinFloorBinding */
export function isAbsoluteDiscountFloorActive(
  atr14dPct: number,
  regime: NoiseTrendRegime = "neutral",
): boolean {
  return isTokenMinFloorBinding(atr14dPct, regime);
}

export interface DiscountLogicBreakdown {
  symbol: string;
  atr14dPct: number;
  noiseTrendRegime: NoiseTrendRegime;
  trendMultiplier: number;
  trendMultiplierLabel: string;
  dynamicNoisePct: number;
  atrScaledMinPct: number;
  tokenMinFloorPct: number;
  tokenMinFloorBinding: boolean;
  s1DistancePct: number;
  s1Accepted: boolean;
  smartTarget: SmartTargetSelection | null;
}

export type DiscountLogicMetrics = Omit<DiscountLogicBreakdown, "symbol">;

/** Inputs scoped to a single token — no shared/global market context. */
export interface PerTokenDiscountLogicInput {
  symbol: string;
  spotPrice: number;
  atr14dPct: number | null;
  sma200: number | null;
  ema21: number | null;
  rsi14: number | null;
  macroTrend: MacroTrend | null;
  shortTermTrend: ShortTermTrend | null;
  support1: number | null;
  support2?: number | null;
  averagePanicWickPct?: number | null;
}

function resolveSnappedSupportLimitPrice(support: number | null): number {
  if (!support || support <= 0) return 0;
  return normalizeLimitPrice(support * (1 + SNAP_ABOVE_SUPPORT_PCT / 100));
}

function resolveSnappedS1LimitPrice(support1: number | null): number {
  return resolveSnappedSupportLimitPrice(support1);
}

/**
 * Recomputes discount/noise metrics for one token object only.
 * Call once per token card — never cache across symbols.
 */
export function buildPerTokenDiscountLogicBreakdown(
  token: PerTokenDiscountLogicInput,
): DiscountLogicBreakdown | null {
  const breakdown = computeDiscountLogicBreakdown({
    spotPrice: token.spotPrice,
    atr14dPct: token.atr14dPct,
    s1LimitPrice: resolveSnappedS1LimitPrice(token.support1),
    s2LimitPrice: resolveSnappedSupportLimitPrice(token.support2 ?? null),
    averagePanicWickPct: token.averagePanicWickPct ?? null,
    sma200: token.sma200,
    ema21: token.ema21,
    rsi14: token.rsi14,
    shortTermTrend: token.shortTermTrend,
    macroTrend: token.macroTrend,
  });
  if (!breakdown) return null;
  return { ...breakdown, symbol: token.symbol };
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
  s2LimitPrice?: number;
  averagePanicWickPct?: number | null;
  sma200?: number | null;
  ema21?: number | null;
  rsi14?: number | null;
  shortTermTrend?: ShortTermTrend | null;
  macroTrend?: MacroTrend | null;
}): DiscountLogicMetrics | null {
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
  const atrScaledMinPct = computeTokenAtrScaledMinFloorPct(input.atr14dPct);
  const tokenMinFloorPct = computeTokenMinFloorPct(
    input.atr14dPct,
    noiseTrendRegime,
  );
  const s1DistancePct =
    input.s1LimitPrice > 0 && input.s1LimitPrice < input.spotPrice
      ? computeDiscountPct(input.spotPrice, input.s1LimitPrice)
      : 0;

  const s1Accepted = s1DistancePct >= tokenMinFloorPct;
  const smartTarget = !s1Accepted
    ? resolveSmartFallbackTarget({
        spotPrice: input.spotPrice,
        atr14dPct: input.atr14dPct,
        s2Limit: input.s2LimitPrice ?? 0,
        averagePanicWickPct: input.averagePanicWickPct ?? null,
        minDiscountPct: tokenMinFloorPct,
      })
    : null;

  return {
    atr14dPct: round1(input.atr14dPct),
    noiseTrendRegime,
    trendMultiplier,
    trendMultiplierLabel: formatNoiseTrendRegimeLabel(noiseTrendRegime),
    dynamicNoisePct,
    atrScaledMinPct,
    tokenMinFloorPct,
    tokenMinFloorBinding: isTokenMinFloorBinding(
      input.atr14dPct,
      noiseTrendRegime,
    ),
    s1DistancePct,
    s1Accepted,
    smartTarget,
  };
}

function tokenMinFloorPrice(spotPrice: number, minFloorPct: number): number {
  if (spotPrice <= 0 || minFloorPct <= 0) return 0;
  return normalizeLimitPrice(spotPrice * (1 - minFloorPct / 100));
}

function enforceTokenMinFloor(
  spotPrice: number,
  limitPrice: number,
  minFloorPct: number,
): {
  limitPrice: number;
  discountPct: number;
  applied: boolean;
} {
  const floorPrice = tokenMinFloorPrice(spotPrice, minFloorPct);
  const discountPct = computeDiscountPct(spotPrice, limitPrice);

  if (
    floorPrice <= 0 ||
    limitPrice <= 0 ||
    limitPrice <= floorPrice ||
    discountPct >= minFloorPct
  ) {
    return { limitPrice, discountPct, applied: false };
  }

  return {
    limitPrice: floorPrice,
    discountPct: minFloorPct,
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
  tokenMinFloorApplied?: boolean;
  tokenMinFloorPct?: number;
}): string {
  const levelLabel =
    input.fallbackSource === "panic_wick" ? "panický knot" : "S2";
  const target = formatDecimal(input.newDiscountPct, 1);

  if (input.tokenMinFloorApplied) {
    const floor = formatDecimal(input.tokenMinFloorPct ?? 0, 1);
    return (
      "Systém aplikoval token-špecifické minimum zľavy " +
      `(max(dynamický šum, 0,5×ATR) = ${floor} %) a posunul limit na hlbšiu úroveň ` +
      `(${levelLabel}, ${target} % pod spotom), aby zabezpečil primeranú nákupnú zľavu pre volatilitu tokenu.`
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
  tokenMinFloorApplied: boolean;
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
  const noiseThresholdPct = computeTokenMinFloorPct(
    input.atr14dPct,
    noiseTrendRegime,
  );
  const tokenMinFloorPct = computeTokenAtrScaledMinFloorPct(input.atr14dPct);
  const tokenMinFloorBinding = isTokenMinFloorBinding(
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
    tokenMinFloorPct: noiseThresholdPct,
  };

  const buildResult = (result: {
    limitPrice: number;
    fallbackApplied: boolean;
    fallbackSource: MinDiscountFallbackSource | null;
    atrGuardrailApplied: boolean;
    narrative?: string | null;
  }) => {
    const enforced = enforceTokenMinFloor(
      input.spotPrice,
      result.limitPrice,
      noiseThresholdPct,
    );
    const fallbackApplied = result.fallbackApplied || enforced.applied;
    const narrative = enforced.applied
      ? buildMinDiscountFallbackNarrative({
          ...narrativeInput,
          tokenMinFloorApplied: true,
          tokenMinFloorPct: noiseThresholdPct,
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
      tokenMinFloorApplied: tokenMinFloorBinding || enforced.applied,
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
  const tokenMinFloorLimit = tokenMinFloorPrice(
    input.spotPrice,
    noiseThresholdPct,
  );

  const smartTarget = resolveSmartFallbackTarget({
    spotPrice: input.spotPrice,
    atr14dPct: input.atr14dPct,
    s2Limit: input.s2Limit,
    averagePanicWickPct: input.averagePanicWickPct ?? null,
    minDiscountPct: noiseThresholdPct,
  });

  if (smartTarget) {
    return buildResult({
      limitPrice: smartTarget.limitPrice,
      fallbackApplied: true,
      fallbackSource: smartTarget.selectedSource,
      atrGuardrailApplied: smartTarget.atrGuardrailApplied,
      narrative: buildSmartTargetNarrative(smartTarget),
    });
  }

  if (guardrail > 0 && guardrail < input.spotPrice) {
    const effectiveGuardrail =
      tokenMinFloorLimit > 0 && guardrail > tokenMinFloorLimit
        ? tokenMinFloorLimit
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

  if (tokenMinFloorLimit > 0 && tokenMinFloorLimit < input.spotPrice) {
    const floorDiscount = computeDiscountPct(
      input.spotPrice,
      tokenMinFloorLimit,
    );
    return buildResult({
      limitPrice: tokenMinFloorLimit,
      fallbackApplied: true,
      fallbackSource: "s2",
      atrGuardrailApplied: false,
      narrative: buildMinDiscountFallbackNarrative({
        ...narrativeInput,
        tokenMinFloorApplied: true,
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

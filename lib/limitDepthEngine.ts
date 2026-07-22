import type { AssetCategory } from "@/lib/portfolioStorage";
import { normalizeLimitPrice } from "@/lib/executionFormatting";
import { formatDecimal, formatRsi } from "@/lib/numberFormat";
import {
  buildRsiInterpolationNarrative,
  computeRsiS2BlendFactor,
  resolveFluidLimitBadge,
  RSI_S1_HOLD_LEVEL,
} from "@/lib/rsiInterpolation";
import {
  applyBearMarketBlendFactor,
  type MacroTrend,
} from "@/lib/macroTrend";
import {
  applyShortTermTrendBlendFactor,
  type ShortTermTrend,
} from "@/lib/shortTermTrend";
import {
  buildPanicWickNarrative,
  resolvePanicWickLimit,
} from "@/lib/panicWickAnalysis";
import { applyMinDiscountBuffer, computeDiscountLogicBreakdown } from "@/lib/minDiscountBuffer";
import type { DiscountLogicBreakdown } from "@/lib/minDiscountBuffer";
import {
  computeSupportResistance,
  SNAP_ABOVE_SUPPORT_PCT,
  type SupportResistanceLevels,
} from "@/lib/supportResistanceLevels";

export const LIMIT_VALIDITY_DAYS = 7;

/** 7-day feasibility guardrail — limit never deeper than spot − 1.5×ATR14. */
export const DEEP_WICK_ATR_GUARDRAIL_MULTIPLIER = 1.5;

export const SEVEN_DAY_CALIBRATION_NARRATIVE =
  "Autonómne vyhodnotená optimálna cena pre 7-dňový cyklus. " +
  "Štrukturálny support je primárny cieľ; ATR slúži výlučne ako mantinel realizovateľnosti.";

export const LIMIT_VALIDITY_INSTRUCTION =
  `Tento limit je optimalizovaný pre najbližších ${LIMIT_VALIDITY_DAYS} dní. ` +
  "Ak sa nenaplní, na burze ho zrušte a vygenerujte si nový.";

export const GTT_TOOLTIP =
  "Na burze nastavte GTT (Good-Till-Time) na 7 dní. Po uplynutí platnosti príkaz zrušte a vygenerujte nový limit z terminálu.";

export type LimitDepthMode = "standard" | "deep_wick";

export const LIMIT_DEPTH_BADGES: Record<LimitDepthMode, string> = {
  standard: "ŠTANDARD (S1)",
  deep_wick: "DEEP WICK (LOV KNOTOV)",
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function supportSnapPrice(support: number | null | undefined): number {
  if (!support || support <= 0) return 0;
  return normalizeLimitPrice(support * (1 + SNAP_ABOVE_SUPPORT_PCT / 100));
}

function atrGuardrailFloor(spotPrice: number, atr14dPct: number): number {
  if (spotPrice <= 0 || atr14dPct <= 0) return 0;
  return normalizeLimitPrice(
    spotPrice *
      (1 - (DEEP_WICK_ATR_GUARDRAIL_MULTIPLIER * atr14dPct) / 100),
  );
}

interface LimitResolution {
  limitPrice: number;
  blendFactor: number;
  atrGuardrailApplied: boolean;
  interpolatedFromS1: number;
  interpolatedFromS2: number;
}

/**
 * Fluid limit: lerp between S1 and S2 by RSI blend factor, then clamp to ATR guardrail.
 */
function resolveInterpolatedLimit(input: {
  spotPrice: number;
  rsi14: number;
  atr14dPct: number;
  support1: number | null;
  support2: number | null;
  macroTrend?: MacroTrend | null;
  shortTermTrend?: ShortTermTrend | null;
}): LimitResolution | null {
  const { spotPrice, rsi14, atr14dPct, macroTrend, shortTermTrend } = input;
  const s1Limit = supportSnapPrice(input.support1);
  const s2Raw = input.support2 ?? input.support1;
  const s2Limit = supportSnapPrice(s2Raw);

  if (s1Limit <= 0 || s1Limit >= spotPrice) {
    return null;
  }

  const rsiBlend = computeRsiS2BlendFactor(rsi14);
  const macroAdjusted = applyBearMarketBlendFactor(rsiBlend, macroTrend ?? null);
  let blendFactor = applyShortTermTrendBlendFactor(
    macroAdjusted,
    shortTermTrend ?? null,
    rsi14,
  );
  if (rsi14 >= RSI_S1_HOLD_LEVEL) {
    blendFactor = 0;
  }
  const effectiveS2 = s2Limit > 0 && s2Limit < s1Limit ? s2Limit : s1Limit;
  const interpolated = normalizeLimitPrice(
    s1Limit + blendFactor * (effectiveS2 - s1Limit),
  );

  const guardrail = atrGuardrailFloor(spotPrice, atr14dPct);
  const atrGuardrailApplied =
    guardrail > 0 && interpolated < guardrail && blendFactor > 0;

  const limitPrice =
    atrGuardrailApplied && guardrail > 0
      ? guardrail
      : interpolated;

  return {
    limitPrice,
    blendFactor,
    atrGuardrailApplied,
    interpolatedFromS1: s1Limit,
    interpolatedFromS2: effectiveS2,
  };
}

export interface AutonomousLimitResult {
  limitPrice: number;
  limitPullbackPct: number;
  limitDepthMode: LimitDepthMode;
  limitDepthBadge: string;
  limitDepthNarrative: string;
  rsiS2BlendPct: number;
  supportResistance: SupportResistanceLevels;
  supportSnapApplied: boolean;
  supportSnapNote: string | null;
  discountLogicBreakdown: DiscountLogicBreakdown | null;
}

export function computeAutonomousLimit(input: {
  symbol: string;
  category: AssetCategory;
  spotPrice: number;
  fearGreedValue: number;
  rsi14: number | null;
  atr14dPct: number | null;
  ema50?: number | null;
  ema21?: number | null;
  sma14?: number | null;
  sma200?: number | null;
  support1?: number | null;
  support2?: number | null;
  support1Source?: string;
  support2Source?: string;
  priceVsSma14Pct?: number | null;
  distSma200Pct?: number | null;
  macroTrend?: MacroTrend | null;
  shortTermTrend?: ShortTermTrend | null;
  averagePanicWickPct?: number | null;
  redDayWickCount?: number;
}): AutonomousLimitResult | null {
  void input.symbol;
  void input.category;
  void input.fearGreedValue;

  if (
    input.spotPrice <= 0 ||
    input.rsi14 == null ||
    input.atr14dPct == null
  ) {
    return null;
  }

  const supportResistance = computeSupportResistance({
    spotPrice: input.spotPrice,
    ema50: input.ema50,
    sma14: input.sma14,
    sma200: input.sma200,
    priceVsSma14Pct: input.priceVsSma14Pct,
    distSma200Pct: input.distSma200Pct,
    atr14dPct: input.atr14dPct,
    support1: input.support1,
    support2: input.support2,
    support1Source: input.support1Source,
    support2Source: input.support2Source,
  });

  const resolution = resolveInterpolatedLimit({
    spotPrice: input.spotPrice,
    rsi14: input.rsi14,
    atr14dPct: input.atr14dPct,
    support1: supportResistance.support1,
    support2: supportResistance.support2,
    macroTrend: input.macroTrend,
    shortTermTrend: input.shortTermTrend,
  });

  if (!resolution) {
    return null;
  }

  const { limitPrice: interpolatedPrice, blendFactor, atrGuardrailApplied: interpGuardrail } =
    resolution;
  const badge = resolveFluidLimitBadge(blendFactor, input.rsi14);

  let limitPrice = interpolatedPrice;
  let atrGuardrailApplied = interpGuardrail;
  let panicWickNarrative: string | null = null;

  if (
    badge.mode === "deep_wick" &&
    input.averagePanicWickPct != null &&
    input.averagePanicWickPct > 0
  ) {
    const panic = resolvePanicWickLimit({
      spotPrice: input.spotPrice,
      averagePanicWickPct: input.averagePanicWickPct,
      atr14dPct: input.atr14dPct,
    });
    limitPrice = panic.limitPrice;
    atrGuardrailApplied = panic.atrGuardrailApplied;
    panicWickNarrative = buildPanicWickNarrative({
      averagePanicWickPct: input.averagePanicWickPct,
      redDayCount: input.redDayWickCount ?? 0,
      atrGuardrailApplied: panic.atrGuardrailApplied,
    });
  }

  const minDiscount = applyMinDiscountBuffer({
    spotPrice: input.spotPrice,
    limitPrice,
    atr14dPct: input.atr14dPct,
    s1Limit: resolution.interpolatedFromS1,
    s2Limit: resolution.interpolatedFromS2,
    sma200: input.sma200,
    ema21: input.ema21,
    rsi14: input.rsi14,
    shortTermTrend: input.shortTermTrend,
    macroTrend: input.macroTrend,
    averagePanicWickPct: input.averagePanicWickPct,
  });

  if (minDiscount.fallbackApplied) {
    limitPrice = minDiscount.limitPrice;
    if (minDiscount.atrGuardrailApplied) {
      atrGuardrailApplied = true;
    }
    panicWickNarrative = minDiscount.narrative;
  }

  const limitPullbackPct =
    input.spotPrice > 0
      ? round1(((input.spotPrice - limitPrice) / input.spotPrice) * 100)
      : 0;

  const narrative = minDiscount.narrative
    ? minDiscount.narrative
    : panicWickNarrative
      ? panicWickNarrative
      : buildRsiInterpolationNarrative({
        rsi14: input.rsi14,
        blendFactor,
        atrGuardrailApplied,
        limitPrice,
      });

  const snapNote = minDiscount.narrative
    ? minDiscount.narrative
    : panicWickNarrative
      ? panicWickNarrative
      : atrGuardrailApplied
    ? `Limit korigovaný 7-dňovým ATR mantinelom (${formatDecimal(DEEP_WICK_ATR_GUARDRAIL_MULTIPLIER, 1)}×ATR14) — interpolácia S1→S2 presiahla 7-dňový dosah.`
    : input.shortTermTrend === "sideways"
      ? "Týždenný SIDEWAYS trend — limit defenzívne na S1, bez lovu hlbokých knotov."
      : input.shortTermTrend === "bear"
        ? `Krátkodobý Bear — priorita Deep Wick / S2 (${Math.round(blendFactor * 100)} % blend).`
        : input.shortTermTrend === "bull"
          ? `Krátkodobý Bull — limit tesne pod spotom (${Math.round(blendFactor * 100)} % blend k S2).`
          : input.macroTrend === "bear"
            ? `Defenzívny Bear režim — limit posunutý smerom k S2 (${Math.round(blendFactor * 100)} % blend, minimum 50 %).`
            : blendFactor > 0
              ? `Dynamická interpolácia S1→S2 podľa RSI (${Math.round(blendFactor * 100)} % smerom k S2).`
              : `Limit prichytený na S1 — RSI ${formatRsi(input.rsi14)} drží neutrálny rozsah.`;

  const discountLogicBreakdown = computeDiscountLogicBreakdown({
    spotPrice: input.spotPrice,
    atr14dPct: input.atr14dPct,
    s1LimitPrice: resolution.interpolatedFromS1,
    sma200: input.sma200,
    ema21: input.ema21,
    rsi14: input.rsi14,
    shortTermTrend: input.shortTermTrend,
    macroTrend: input.macroTrend,
  });

  return {
    limitPrice,
    limitPullbackPct,
    limitDepthMode: badge.mode,
    limitDepthBadge: badge.badge,
    limitDepthNarrative: `${narrative} Cieľ ${formatDecimal(limitPrice, 4)}.`,
    rsiS2BlendPct: Math.round(blendFactor * 100),
    supportResistance,
    supportSnapApplied: true,
    supportSnapNote: snapNote,
    discountLogicBreakdown,
  };
}

/** @deprecated Use fluid RSI interpolation — kept for type compatibility. */
export function resolveLimitDepthMode(input: {
  fearGreedValue: number;
  rsi14: number | null;
  atr14dPct: number | null;
}): LimitDepthMode {
  void input.fearGreedValue;
  void input.atr14dPct;
  if (input.rsi14 == null) return "standard";
  return computeRsiS2BlendFactor(input.rsi14) >= 0.65 ? "deep_wick" : "standard";
}

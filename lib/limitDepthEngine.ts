import type { AssetCategory } from "@/lib/portfolioStorage";
import { normalizeLimitPrice } from "@/lib/executionFormatting";
import { formatDecimal } from "@/lib/numberFormat";
import {
  applySmartSupportSnap,
  computeSupportResistance,
  SNAP_ABOVE_SUPPORT_PCT,
  type SupportResistanceLevels,
} from "@/lib/supportResistanceLevels";

export const LIMIT_VALIDITY_DAYS = 7;

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

const DEEP_WICK_FG_THRESHOLD = 20;
const DEEP_WICK_RSI_THRESHOLD = 30;
const DEEP_WICK_ATR_THRESHOLD = 6;

const STANDARD_ATR_MULTIPLIER: Record<AssetCategory, number> = {
  core: 1.5,
  satellite: 1.8,
  yield: 2.0,
};

const DEEP_WICK_ATR_MULTIPLIER: Record<AssetCategory, number> = {
  core: 3.0,
  satellite: 3.5,
  yield: 4.0,
};

const CORE_PULLBACK_PCT = 2.5;

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function resolveLimitDepthMode(input: {
  fearGreedValue: number;
  rsi14: number | null;
  atr14dPct: number | null;
}): LimitDepthMode {
  if (input.fearGreedValue < DEEP_WICK_FG_THRESHOLD) return "deep_wick";
  if (input.rsi14 != null && input.rsi14 < DEEP_WICK_RSI_THRESHOLD) {
    return "deep_wick";
  }
  if (input.atr14dPct != null && input.atr14dPct >= DEEP_WICK_ATR_THRESHOLD) {
    return "deep_wick";
  }
  return "standard";
}

function buildDepthNarrative(input: {
  mode: LimitDepthMode;
  symbol: string;
  fearGreedValue: number;
  rsi14: number;
  atr14dPct: number;
  supportSource: string;
  supportLevel: number | null;
}): string {
  if (input.mode === "deep_wick") {
    const triggers: string[] = [];
    if (input.fearGreedValue < DEEP_WICK_FG_THRESHOLD) {
      triggers.push(`F&G ${Math.round(input.fearGreedValue)} (extrémny strach)`);
    }
    if (input.rsi14 < DEEP_WICK_RSI_THRESHOLD) {
      triggers.push(`RSI ${input.rsi14.toFixed(0)} (oversold)`);
    }
    if (input.atr14dPct >= DEEP_WICK_ATR_THRESHOLD) {
      triggers.push(`ATR ${input.atr14dPct.toFixed(1)} % (vysoká volatilita)`);
    }

    const supportText =
      input.supportLevel != null
        ? `Support ${input.supportSource} ${formatDecimal(input.supportLevel, 4)}`
        : "hlbší ATR pás";

    return (
      `Vysoká volatilita / strach (${triggers.join(" · ")}). ` +
      `Limit znížený na ${supportText} pre lov flash-crash knotov.`
    );
  }

  const supportText =
    input.supportLevel != null
      ? `${input.supportSource} ${formatDecimal(input.supportLevel, 4)}`
      : "štandardný ATR pás";

  return (
    `Pokojný trh (F&G ${Math.round(input.fearGreedValue)}, RSI ${input.rsi14.toFixed(0)}, ATR ${input.atr14dPct.toFixed(1)} %). ` +
    `Limit prichytený na najbližší support ${supportText} alebo bežný ATR pullback.`
  );
}

function computeRawLimitPrice(input: {
  spotPrice: number;
  mode: LimitDepthMode;
  category: AssetCategory;
  atr14dPct: number;
  ema50?: number | null;
  support1?: number | null;
  support2?: number | null;
}): number {
  const { spotPrice, mode, category, atr14dPct } = input;
  if (spotPrice <= 0) return 0;

  const atrMult =
    mode === "deep_wick"
      ? DEEP_WICK_ATR_MULTIPLIER[category]
      : STANDARD_ATR_MULTIPLIER[category];

  const atrLimit = spotPrice * (1 - (atrMult * atr14dPct) / 100);

  if (mode === "deep_wick") {
    const support = input.support2 ?? input.support1 ?? null;
    const supportLimit =
      support && support > 0
        ? support * (1 + SNAP_ABOVE_SUPPORT_PCT / 100)
        : 0;
    const candidates = [atrLimit, supportLimit].filter((price) => price > 0);
    return candidates.length > 0
      ? normalizeLimitPrice(Math.min(...candidates))
      : normalizeLimitPrice(atrLimit);
  }

  const pullbackPrice = spotPrice * (1 - CORE_PULLBACK_PCT / 100);
  const support = input.support1 ?? null;
  const supportLimit =
    support && support > 0
      ? support * (1 + SNAP_ABOVE_SUPPORT_PCT / 100)
      : 0;

  if (category === "core") {
    const ema50 = input.ema50 ?? 0;
    const emaLimit =
      ema50 > 0 && ema50 < spotPrice ? ema50 : 0;
    const candidates = [atrLimit, supportLimit, emaLimit, pullbackPrice].filter(
      (price) => price > 0,
    );
    return normalizeLimitPrice(Math.max(...candidates));
  }

  const candidates = [atrLimit, supportLimit].filter((price) => price > 0);
  return candidates.length > 0
    ? normalizeLimitPrice(Math.max(...candidates))
    : normalizeLimitPrice(atrLimit);
}

export interface AutonomousLimitResult {
  limitPrice: number;
  limitPullbackPct: number;
  limitDepthMode: LimitDepthMode;
  limitDepthBadge: string;
  limitDepthNarrative: string;
  supportResistance: SupportResistanceLevels;
  supportSnapApplied: boolean;
  supportSnapNote: string | null;
}

export function computeAutonomousLimit(input: {
  symbol: string;
  category: AssetCategory;
  spotPrice: number;
  fearGreedValue: number;
  rsi14: number | null;
  atr14dPct: number | null;
  ema50?: number | null;
  sma14?: number | null;
  sma200?: number | null;
  support1?: number | null;
  support2?: number | null;
  support1Source?: string;
  support2Source?: string;
  priceVsSma14Pct?: number | null;
  distSma200Pct?: number | null;
}): AutonomousLimitResult | null {
  if (
    input.spotPrice <= 0 ||
    input.rsi14 == null ||
    input.atr14dPct == null
  ) {
    return null;
  }

  const mode = resolveLimitDepthMode({
    fearGreedValue: input.fearGreedValue,
    rsi14: input.rsi14,
    atr14dPct: input.atr14dPct,
  });

  const rawLimitPrice = computeRawLimitPrice({
    spotPrice: input.spotPrice,
    mode,
    category: input.category,
    atr14dPct: input.atr14dPct,
    ema50: input.ema50,
    support1: input.support1,
    support2: input.support2,
  });

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

  const snapTarget =
    mode === "deep_wick"
      ? supportResistance.support2 ?? supportResistance.support1
      : supportResistance.support1;

  const snapSource =
    mode === "deep_wick"
      ? supportResistance.support2Source !== "—"
        ? supportResistance.support2Source
        : supportResistance.supportSource
      : supportResistance.supportSource;

  const snap = applySmartSupportSnap({
    spotPrice: input.spotPrice,
    limitPrice: rawLimitPrice,
    support1: snapTarget,
    atr14dPct: input.atr14dPct,
    supportSource: snapSource,
  });

  const limitPrice = snap.limitPrice;
  const limitPullbackPct =
    input.spotPrice > 0 && limitPrice > 0
      ? round1(((input.spotPrice - limitPrice) / input.spotPrice) * 100)
      : 0;

  const supportLevel =
    mode === "deep_wick"
      ? supportResistance.support2 ?? supportResistance.support1
      : supportResistance.support1;

  const supportSource =
    mode === "deep_wick"
      ? supportResistance.support2Source !== "—"
        ? supportResistance.support2Source
        : supportResistance.supportSource
      : supportResistance.supportSource;

  return {
    limitPrice,
    limitPullbackPct,
    limitDepthMode: mode,
    limitDepthBadge: LIMIT_DEPTH_BADGES[mode],
    limitDepthNarrative: buildDepthNarrative({
      mode,
      symbol: input.symbol,
      fearGreedValue: input.fearGreedValue,
      rsi14: input.rsi14,
      atr14dPct: input.atr14dPct,
      supportSource,
      supportLevel,
    }),
    supportResistance,
    supportSnapApplied: snap.snapped,
    supportSnapNote: snap.snapNote,
  };
}

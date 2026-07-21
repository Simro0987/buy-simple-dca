import type { AssetCategory } from "@/lib/portfolioStorage";
import { normalizeLimitPrice } from "@/lib/executionFormatting";
import { formatDecimal } from "@/lib/numberFormat";
import {
  computeSupportResistance,
  SNAP_ABOVE_SUPPORT_PCT,
  type SupportResistanceLevels,
} from "@/lib/supportResistanceLevels";

export const LIMIT_VALIDITY_DAYS = 7;

/** Standard 7-day fill calibration — spot minus 0.75 × ATR14 (%). */
export const STANDARD_ATR_MULTIPLIER = 0.75;

/** Deep-wick 7-day fill calibration — absolute maximum depth (1.5 × ATR14 %). */
export const DEEP_WICK_ATR_MULTIPLIER = 1.5;

export const SEVEN_DAY_CALIBRATION_NARRATIVE =
  "Autonómne vyhodnotená optimálna cena pre 7-dňový cyklus. " +
  "Použitý násobok volatility zabezpečuje vyvážený pomer medzi ochranou kapitálu " +
  "a reálnou šancou na vyplnenie príkazu bez nutnosti jeho úprav.";

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

function supportSnapPrice(support: number | null | undefined): number {
  if (!support || support <= 0) return 0;
  return normalizeLimitPrice(support * (1 + SNAP_ABOVE_SUPPORT_PCT / 100));
}

function atrPullbackLimit(
  spotPrice: number,
  atr14dPct: number,
  multiplier: number,
): number {
  if (spotPrice <= 0 || atr14dPct <= 0) return 0;
  return normalizeLimitPrice(
    spotPrice * (1 - (multiplier * atr14dPct) / 100),
  );
}

function buildDepthNarrative(input: {
  mode: LimitDepthMode;
  fearGreedValue: number;
  rsi14: number;
  atr14dPct: number;
  atrMultiplier: number;
  supportSource: string;
  supportLevel: number | null;
  limitPrice: number;
}): string {
  const atrDepthPct = formatDecimal(input.atrMultiplier * input.atr14dPct, 2);
  const modeLabel =
    input.mode === "deep_wick"
      ? `Deep Wick režim (max ${formatDecimal(DEEP_WICK_ATR_MULTIPLIER, 2)}×ATR14 = −${atrDepthPct} %)`
      : `Štandardný trh (${formatDecimal(STANDARD_ATR_MULTIPLIER, 2)}×ATR14 = −${atrDepthPct} %)`;

  const supportText =
    input.supportLevel != null
      ? ` · Support ${input.supportSource} ${formatDecimal(input.supportLevel, 4)}`
      : "";

  return (
    `${modeLabel} · F&G ${Math.round(input.fearGreedValue)} · RSI ${input.rsi14.toFixed(0)} · ` +
    `ATR14 ${formatDecimal(input.atr14dPct, 1)} %${supportText} · ` +
    `Cieľ ${formatDecimal(input.limitPrice, 4)}.`
  );
}

/**
 * Single optimal limit for a 7-day GTT window.
 * Standard: max(0.75×ATR pullback, S1 snap) — closer to spot for fill rate.
 * Deep Wick: max(1.5×ATR floor, S2 snap) — never deeper than 1.5×ATR14.
 */
function computeOptimalLimitPrice(input: {
  spotPrice: number;
  mode: LimitDepthMode;
  atr14dPct: number;
  support1?: number | null;
  support2?: number | null;
}): number {
  const { spotPrice, mode, atr14dPct } = input;
  if (spotPrice <= 0) return 0;

  if (mode === "deep_wick") {
    const deepFloor = atrPullbackLimit(
      spotPrice,
      atr14dPct,
      DEEP_WICK_ATR_MULTIPLIER,
    );
    const s2Limit = supportSnapPrice(input.support2 ?? input.support1);
    const candidates = [deepFloor, s2Limit].filter(
      (price) => price > 0 && price < spotPrice * 0.999,
    );
    if (candidates.length === 0) return deepFloor;
    return normalizeLimitPrice(Math.max(...candidates));
  }

  const atrLimit = atrPullbackLimit(
    spotPrice,
    atr14dPct,
    STANDARD_ATR_MULTIPLIER,
  );
  const s1Limit = supportSnapPrice(input.support1);
  const candidates = [atrLimit, s1Limit].filter(
    (price) => price > 0 && price < spotPrice * 0.999,
  );
  if (candidates.length === 0) return atrLimit;
  return normalizeLimitPrice(Math.max(...candidates));
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
  void input.symbol;
  void input.category;

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

  const limitPrice = computeOptimalLimitPrice({
    spotPrice: input.spotPrice,
    mode,
    atr14dPct: input.atr14dPct,
    support1: supportResistance.support1,
    support2: supportResistance.support2,
  });

  const limitPullbackPct =
    input.spotPrice > 0 && limitPrice > 0
      ? round1(((input.spotPrice - limitPrice) / input.spotPrice) * 100)
      : 0;

  const atrMultiplier =
    mode === "deep_wick"
      ? DEEP_WICK_ATR_MULTIPLIER
      : STANDARD_ATR_MULTIPLIER;

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

  const usedSupport =
    mode === "deep_wick"
      ? supportLevel != null &&
        limitPrice >= supportSnapPrice(supportLevel) * 0.998
      : supportLevel != null &&
        limitPrice >= supportSnapPrice(supportLevel) * 0.998;

  const snapNote = usedSupport
    ? `Limit prichytený na ${supportSource} zóne (${formatDecimal(supportLevel ?? 0, 4)}) pre 7-dňovú šancu vyplnenia.`
    : null;

  return {
    limitPrice,
    limitPullbackPct,
    limitDepthMode: mode,
    limitDepthBadge: LIMIT_DEPTH_BADGES[mode],
    limitDepthNarrative: buildDepthNarrative({
      mode,
      fearGreedValue: input.fearGreedValue,
      rsi14: input.rsi14,
      atr14dPct: input.atr14dPct,
      atrMultiplier,
      supportSource,
      supportLevel,
      limitPrice,
    }),
    supportResistance,
    supportSnapApplied: usedSupport,
    supportSnapNote: snapNote,
  };
}

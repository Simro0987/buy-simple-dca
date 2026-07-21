import type { AssetCategory } from "@/lib/portfolioStorage";
import { normalizeLimitPrice } from "@/lib/executionFormatting";
import { formatDecimal } from "@/lib/numberFormat";
import {
  computeSupportResistance,
  SNAP_ABOVE_SUPPORT_PCT,
  type SupportResistanceLevels,
} from "@/lib/supportResistanceLevels";

export const LIMIT_VALIDITY_DAYS = 7;

/** 7-day feasibility guardrail — used ONLY in Deep Wick when S2 is too deep. */
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

const DEEP_WICK_FG_THRESHOLD = 20;
const DEEP_WICK_RSI_THRESHOLD = 30;

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
  return "standard";
}

function supportSnapPrice(support: number | null | undefined): number {
  if (!support || support <= 0) return 0;
  return normalizeLimitPrice(support * (1 + SNAP_ABOVE_SUPPORT_PCT / 100));
}

/** 7-day ATR guardrail floor — only for Deep Wick when S2 is unrealistically deep. */
function atrGuardrailFloor(
  spotPrice: number,
  atr14dPct: number,
): number {
  if (spotPrice <= 0 || atr14dPct <= 0) return 0;
  return normalizeLimitPrice(
    spotPrice *
      (1 - (DEEP_WICK_ATR_GUARDRAIL_MULTIPLIER * atr14dPct) / 100),
  );
}

function supportDepthPct(spotPrice: number, supportPrice: number): number {
  if (spotPrice <= 0 || supportPrice <= 0) return 0;
  return ((spotPrice - supportPrice) / spotPrice) * 100;
}

interface LimitResolution {
  limitPrice: number;
  structuralSupportUsed: boolean;
  atrGuardrailApplied: boolean;
  supportSource: string;
  supportLevel: number | null;
}

/**
 * Standard: snap directly to structural S1 — no ATR subtraction.
 * Deep Wick: snap to S2; if S2 is deeper than 1.5×ATR14, raise to ATR guardrail.
 */
function resolveStructuralLimit(input: {
  spotPrice: number;
  mode: LimitDepthMode;
  atr14dPct: number;
  support1: number | null;
  support2: number | null;
  support1Source: string;
  support2Source: string;
}): LimitResolution {
  const { spotPrice, mode, atr14dPct } = input;

  if (mode === "standard") {
    const s1 = input.support1;
    const s1Limit = supportSnapPrice(s1);

    if (s1Limit > 0 && s1Limit < spotPrice * 0.999) {
      return {
        limitPrice: s1Limit,
        structuralSupportUsed: true,
        atrGuardrailApplied: false,
        supportSource: input.support1Source,
        supportLevel: s1,
      };
    }

    return {
      limitPrice: 0,
      structuralSupportUsed: false,
      atrGuardrailApplied: false,
      supportSource: input.support1Source,
      supportLevel: s1,
    };
  }

  const s2 = input.support2 ?? input.support1;
  const s2Source =
    input.support2 != null ? input.support2Source : input.support1Source;
  const s2Limit = supportSnapPrice(s2);
  const guardrail = atrGuardrailFloor(spotPrice, atr14dPct);
  const maxDepthPct = DEEP_WICK_ATR_GUARDRAIL_MULTIPLIER * atr14dPct;

  if (s2Limit > 0 && s2 != null) {
    const s2DepthPct = supportDepthPct(spotPrice, s2);

    if (s2DepthPct <= maxDepthPct) {
      return {
        limitPrice: s2Limit,
        structuralSupportUsed: true,
        atrGuardrailApplied: false,
        supportSource: s2Source,
        supportLevel: s2,
      };
    }

    if (guardrail > 0) {
      return {
        limitPrice: guardrail,
        structuralSupportUsed: true,
        atrGuardrailApplied: true,
        supportSource: s2Source,
        supportLevel: s2,
      };
    }
  }

  if (guardrail > 0) {
    return {
      limitPrice: guardrail,
      structuralSupportUsed: false,
      atrGuardrailApplied: true,
      supportSource: "ATR mantinel",
      supportLevel: null,
    };
  }

  return {
    limitPrice: 0,
    structuralSupportUsed: false,
    atrGuardrailApplied: false,
    supportSource: s2Source,
    supportLevel: s2,
  };
}

function buildDepthNarrative(input: {
  mode: LimitDepthMode;
  resolution: LimitResolution;
  fearGreedValue: number;
  rsi14: number;
  atr14dPct: number;
  limitPrice: number;
}): string {
  const { resolution, mode } = input;
  const supportLabel =
    resolution.supportLevel != null
      ? `${resolution.supportSource} ${formatDecimal(resolution.supportLevel, 4)}`
      : resolution.supportSource;

  let logicText: string;

  if (mode === "standard") {
    logicText = resolution.structuralSupportUsed
      ? `Cena prichytená na štrukturálny Support S1 (${supportLabel}).`
      : "Čakáme na identifikáciu štrukturálneho Supportu S1 z klines.";
  } else if (resolution.atrGuardrailApplied) {
    logicText =
      `Cena cieli na hlboký Support S2 (${supportLabel}), avšak bola korigovaná ` +
      `7-dňovým ATR mantinelom (${formatDecimal(DEEP_WICK_ATR_GUARDRAIL_MULTIPLIER, 1)}×ATR14 = ` +
      `−${formatDecimal(DEEP_WICK_ATR_GUARDRAIL_MULTIPLIER * input.atr14dPct, 2)} %) ` +
      "pre zachovanie reálnej šance na vyplnenie príkazu.";
  } else {
    logicText = `Cena prichytená na hlboký štrukturálny Support S2 (${supportLabel}).`;
  }

  return (
    `${logicText} F&G ${Math.round(input.fearGreedValue)} · RSI ${input.rsi14.toFixed(0)} · ` +
    `ATR14 ${formatDecimal(input.atr14dPct, 1)} % · Cieľ ${formatDecimal(input.limitPrice, 4)}.`
  );
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

  const resolution = resolveStructuralLimit({
    spotPrice: input.spotPrice,
    mode,
    atr14dPct: input.atr14dPct,
    support1: supportResistance.support1,
    support2: supportResistance.support2,
    support1Source: supportResistance.supportSource,
    support2Source: supportResistance.support2Source,
  });

  if (resolution.limitPrice <= 0) {
    return null;
  }

  const limitPrice = resolution.limitPrice;
  const limitPullbackPct =
    input.spotPrice > 0
      ? round1(((input.spotPrice - limitPrice) / input.spotPrice) * 100)
      : 0;

  const snapNote = resolution.atrGuardrailApplied
    ? `Limit korigovaný 7-dňovým ATR mantinelom (${formatDecimal(DEEP_WICK_ATR_GUARDRAIL_MULTIPLIER, 1)}×ATR14) — S2 príliš hlboký pre 7-dňové okno.`
    : resolution.structuralSupportUsed
      ? `Limit prichytený na ${resolution.supportSource} zóne (${formatDecimal(resolution.supportLevel ?? 0, 4)}).`
      : null;

  return {
    limitPrice,
    limitPullbackPct,
    limitDepthMode: mode,
    limitDepthBadge: LIMIT_DEPTH_BADGES[mode],
    limitDepthNarrative: buildDepthNarrative({
      mode,
      resolution,
      fearGreedValue: input.fearGreedValue,
      rsi14: input.rsi14,
      atr14dPct: input.atr14dPct,
      limitPrice,
    }),
    supportResistance,
    supportSnapApplied:
      resolution.structuralSupportUsed || resolution.atrGuardrailApplied,
    supportSnapNote: snapNote,
  };
}

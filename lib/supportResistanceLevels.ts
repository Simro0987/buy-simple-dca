import { normalizeLimitPrice } from "@/lib/executionFormatting";
import { formatDecimal, formatSignedPct } from "@/lib/numberFormat";

/** Nearest strong horizontal support (S1, S2) and resistance (R1) for a token. */
export interface SupportResistanceLevels {
  support1: number | null;
  support2: number | null;
  resistance1: number | null;
  distToSupportPct: number | null;
  distToSupport2Pct: number | null;
  distToResistancePct: number | null;
  supportSource: string;
  support2Source: string;
  resistanceSource: string;
}

export interface SupportSnapResult {
  limitPrice: number;
  snapped: boolean;
  originalLimitPrice: number;
  snapNote: string | null;
}

/** Limit within this % of S1 triggers smart snapping. */
export const SNAP_PROXIMITY_PCT = 1.2;

/** Place snapped limit this % above S1 (fill before bounce). */
export const SNAP_ABOVE_SUPPORT_PCT = 0.18;

interface LevelCandidate {
  price: number;
  source: string;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function distancePct(spot: number, level: number): number {
  if (spot <= 0 || level <= 0) return 0;
  return round2(((level - spot) / spot) * 100);
}

function deriveSmaFromDeviation(
  spot: number,
  deviationPct: number | null | undefined,
): number | null {
  if (!spot || deviationPct == null) return null;
  const level = spot / (1 + deviationPct / 100);
  return level > 0 ? level : null;
}

function pickNearestSupport(
  spot: number,
  candidates: LevelCandidate[],
): LevelCandidate | null {
  const below = candidates.filter(
    (candidate) => candidate.price > 0 && candidate.price < spot * 0.998,
  );
  if (below.length === 0) return null;
  return below.sort((a, b) => b.price - a.price)[0];
}

function pickNearestResistance(
  spot: number,
  candidates: LevelCandidate[],
): LevelCandidate | null {
  const above = candidates.filter(
    (candidate) => candidate.price > 0 && candidate.price > spot * 1.002,
  );
  if (above.length === 0) return null;
  return above.sort((a, b) => a.price - b.price)[0];
}

export function computeSupportResistance(input: {
  spotPrice: number;
  ema50?: number | null;
  sma14?: number | null;
  sma200?: number | null;
  priceVsSma14Pct?: number | null;
  distSma200Pct?: number | null;
  atr14dPct?: number | null;
  support1?: number | null;
  support2?: number | null;
  support1Source?: string;
  support2Source?: string;
}): SupportResistanceLevels {
  const spot = input.spotPrice;
  if (spot <= 0) {
    return {
      support1: null,
      support2: null,
      resistance1: null,
      distToSupportPct: null,
      distToSupport2Pct: null,
      distToResistancePct: null,
      supportSource: "—",
      support2Source: "—",
      resistanceSource: "—",
    };
  }

  const sma14 =
    input.sma14 ??
    deriveSmaFromDeviation(spot, input.priceVsSma14Pct);
  const sma200 =
    input.sma200 ??
    deriveSmaFromDeviation(spot, input.distSma200Pct);
  const atr = input.atr14dPct ?? 4;
  const swingLow = spot * (1 - (Math.min(atr, 12) * 2) / 100);
  const swingHigh = spot * (1 + (Math.min(atr, 12) * 1.5) / 100);

  const klineSupport1 =
    input.support1 && input.support1 > 0
      ? { price: input.support1, source: input.support1Source ?? "Kline S1" }
      : null;
  const klineSupport2 =
    input.support2 && input.support2 > 0
      ? { price: input.support2, source: input.support2Source ?? "Kline S2" }
      : null;

  const support = klineSupport1 ??
    pickNearestSupport(spot, [
      { price: input.ema50 ?? 0, source: "EMA50" },
      { price: sma14 ?? 0, source: "SMA14" },
      { price: sma200 ?? 0, source: "SMA200" },
      { price: swingLow, source: "Swing Low" },
    ]);

  const support2 =
    klineSupport2 ??
    (() => {
      const candidates = [
        { price: input.ema50 ?? 0, source: "EMA50" },
        { price: sma200 ?? 0, source: "SMA200" },
        { price: swingLow * 0.985, source: "Swing Low L2" },
      ];
      const below = candidates
        .filter(
          (candidate) =>
            candidate.price > 0 &&
            candidate.price < (support?.price ?? spot) * 0.995,
        )
        .sort((a, b) => b.price - a.price);
      return below[0] ?? null;
    })();

  const resistance = pickNearestResistance(spot, [
    { price: input.ema50 ?? 0, source: "EMA50" },
    { price: sma14 ?? 0, source: "SMA14" },
    { price: sma200 ?? 0, source: "SMA200" },
    { price: swingHigh, source: "Swing High" },
  ]);

  return {
    support1: support?.price ?? null,
    support2: support2?.price ?? null,
    resistance1: resistance?.price ?? null,
    distToSupportPct: support ? distancePct(spot, support.price) : null,
    distToSupport2Pct: support2 ? distancePct(spot, support2.price) : null,
    distToResistancePct: resistance ? distancePct(spot, resistance.price) : null,
    supportSource: support?.source ?? "—",
    support2Source: support2?.source ?? "—",
    resistanceSource: resistance?.source ?? "—",
  };
}

/**
 * If ATR-based limit lands near S1, snap slightly above support
 * to maximize fill odds before a bounce.
 */
export function applySmartSupportSnap(input: {
  spotPrice: number;
  limitPrice: number;
  support1: number | null;
  atr14dPct?: number | null;
  supportSource?: string;
}): SupportSnapResult {
  const { spotPrice, support1 } = input;
  const originalLimitPrice = input.limitPrice;

  if (spotPrice <= 0 || originalLimitPrice <= 0 || !support1 || support1 <= 0) {
    return {
      limitPrice: originalLimitPrice,
      snapped: false,
      originalLimitPrice,
      snapNote: null,
    };
  }

  const atr = input.atr14dPct ?? 4;
  const proximityThreshold = Math.max(
    SNAP_PROXIMITY_PCT,
    Math.min(atr * 0.28, 2.5),
  );
  const distToSupportFromLimitPct =
    (Math.abs(originalLimitPrice - support1) / spotPrice) * 100;

  const limitNearSupport =
    distToSupportFromLimitPct <= proximityThreshold ||
    (originalLimitPrice <= support1 * 1.004 &&
      originalLimitPrice >= support1 * 0.992);

  if (!limitNearSupport) {
    return {
      limitPrice: originalLimitPrice,
      snapped: false,
      originalLimitPrice,
      snapNote: null,
    };
  }

  const snappedRaw = support1 * (1 + SNAP_ABOVE_SUPPORT_PCT / 100);
  const snappedPrice = normalizeLimitPrice(snappedRaw);

  if (snappedPrice >= spotPrice * 0.999 || snappedPrice <= 0) {
    return {
      limitPrice: originalLimitPrice,
      snapped: false,
      originalLimitPrice,
      snapNote: null,
    };
  }

  const sourceLabel = input.supportSource ?? "S1";
  return {
    limitPrice: snappedPrice,
    snapped: true,
    originalLimitPrice,
    snapNote:
      `Limit upravený k ${sourceLabel} zóne (${formatDecimal(support1, 4)}) ` +
      `na zamedzenie minutia nákupu — snap +${formatDecimal(SNAP_ABOVE_SUPPORT_PCT, 2)}% nad support.`,
  };
}

export function formatSupportResistanceSummary(
  levels: SupportResistanceLevels,
): string {
  const parts: string[] = [];

  if (levels.support1 != null && levels.distToSupportPct != null) {
    parts.push(
      `S1 ${levels.supportSource} ${formatDecimal(levels.support1, 4)} (${formatSignedPct(levels.distToSupportPct, 1)})`,
    );
  }

  if (levels.support2 != null && levels.distToSupport2Pct != null) {
    parts.push(
      `S2 ${levels.support2Source} ${formatDecimal(levels.support2, 4)} (${formatSignedPct(levels.distToSupport2Pct, 1)})`,
    );
  }

  if (levels.resistance1 != null && levels.distToResistancePct != null) {
    parts.push(
      `R1 ${levels.resistanceSource} ${formatDecimal(levels.resistance1, 4)} (${formatSignedPct(levels.distToResistancePct, 1)})`,
    );
  }

  return parts.length > 0 ? parts.join(" · ") : "S/R úrovne sa načítavajú…";
}

export function finalizeLimitWithSupportSnap(input: {
  spotPrice: number;
  limitPrice: number;
  ema50?: number | null;
  sma14?: number | null;
  sma200?: number | null;
  priceVsSma14Pct?: number | null;
  distSma200Pct?: number | null;
  atr14dPct?: number | null;
  support1?: number | null;
  support2?: number | null;
  support1Source?: string;
  support2Source?: string;
}): {
  limitPrice: number;
  limitPullbackPct: number;
  supportResistance: SupportResistanceLevels;
  supportSnapApplied: boolean;
  supportSnapNote: string | null;
} {
  const supportResistance = computeSupportResistance(input);
  const snap = applySmartSupportSnap({
    spotPrice: input.spotPrice,
    limitPrice: input.limitPrice,
    support1: supportResistance.support1,
    atr14dPct: input.atr14dPct,
    supportSource: supportResistance.supportSource,
  });

  const finalLimit = snap.limitPrice;
  const limitPullbackPct =
    input.spotPrice > 0 && finalLimit > 0
      ? Math.round(
          ((input.spotPrice - finalLimit) / input.spotPrice) * 1000,
        ) / 10
      : 0;

  return {
    limitPrice: finalLimit,
    limitPullbackPct,
    supportResistance,
    supportSnapApplied: snap.snapped,
    supportSnapNote: snap.snapNote,
  };
}

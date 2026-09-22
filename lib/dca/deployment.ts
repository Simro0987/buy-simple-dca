import { REGIME_COPY, REGIME_ORDER } from "@/lib/dca/confluence";
import { computeVolumeSma } from "@/lib/dca/indicators";
import { clamp, lerp, mapRange, roundUsd, smoothstep, softmax } from "@/lib/dca/math";
import type {
  ConfidenceLevel,
  DeploymentDecision,
  FactorBreakdown,
  RegimeBlendShare,
  RegimeFactorId,
  RegimeKind,
  RegimeMetrics,
  TokenMarketSnapshot,
} from "@/lib/dca/types";

/**
 * Phase A — How Much.
 * Five factors (Valuácia / Trend / Sentiment / Momentum / Riziko) compute
 * Final Score 0–100, then a continuous curve maps score → allocation % of the
 * weekly budget. Distinct from Phase B CONFLUENCE (200WMA / F&G / liquidity / ATR / CBBI).
 */
const ALLOCATION_ANCHORS: Array<{ h: number; alloc: number }> = [
  { h: 0, alloc: 22 },
  { h: 18, alloc: 32 },
  { h: 35, alloc: 40 },
  { h: 47, alloc: 48 },
  { h: 58, alloc: 58 },
  { h: 68, alloc: 72 },
  { h: 82, alloc: 42 },
  { h: 100, alloc: 28 },
];

export const PHASE_A_WEIGHTS = {
  valuation: 0.3,
  trend: 0.2,
  sentiment: 0.2,
  momentum: 0.15,
  risk: 0.15,
} as const;

const REGIME_WEIGHTS: Record<RegimeKind, Record<RegimeFactorId, number>> = {
  PANIC: { valuation: 0.22, trend: 0.12, sentiment: 0.28, momentum: 0.13, risk: 0.25 },
  BEAR: { valuation: 0.38, trend: 0.22, sentiment: 0.14, momentum: 0.1, risk: 0.16 },
  SIDEWAYS: { ...PHASE_A_WEIGHTS },
  BULL: { valuation: 0.24, trend: 0.28, sentiment: 0.16, momentum: 0.2, risk: 0.12 },
  EUPHORIA: { valuation: 0.34, trend: 0.14, sentiment: 0.26, momentum: 0.1, risk: 0.16 },
};

const SOFTMAX_TEMPERATURE = 16;

function blendSource(
  ...parts: Array<{ source: FactorBreakdown["source"] }>
): FactorBreakdown["source"] {
  return parts.every((part) => part.source === "live")
    ? "live"
    : parts.some((part) => part.source === "live")
      ? "live"
      : "mock";
}

export function allocationFromHeat(heat: number): number {
  const score = clamp(heat, 0, 100);
  const last = ALLOCATION_ANCHORS[ALLOCATION_ANCHORS.length - 1];
  let low = ALLOCATION_ANCHORS[0];
  let high = last;
  for (let index = 0; index < ALLOCATION_ANCHORS.length - 1; index += 1) {
    const current = ALLOCATION_ANCHORS[index];
    const next = ALLOCATION_ANCHORS[index + 1];
    if (score >= current.h && score <= next.h) {
      low = current;
      high = next;
      break;
    }
  }
  const t = smoothstep(low.h, high.h, score);
  return Math.round(clamp(12, 85, lerp(low.alloc, high.alloc, t)) * 10) / 10;
}

function valuationScore(btc: TokenMarketSnapshot | undefined): {
  score: number;
  note: string;
  source: FactorBreakdown["source"];
} {
  const price = btc?.price ?? 0;
  const sma200 = btc?.indicators?.sma200 ?? 0;
  const dev = btc?.indicators?.sma200DevPct;
  if (!(price > 0) || !(sma200 > 0)) {
    return { score: 50, note: "200D SMA nie je dostupná", source: "mock" };
  }
  const pct = Number.isFinite(dev) ? (dev as number) : ((price - sma200) / sma200) * 100;
  const score = Math.round(clamp(mapRange(pct, -40, 80, 12, 94), 0, 100));
  const sign = pct >= 0 ? "+" : "";
  return {
    score,
    note: `BTC ${sign}${pct.toFixed(1)}% vs 200D SMA`,
    source: "live",
  };
}

function trendScore(btc: TokenMarketSnapshot | undefined): {
  score: number;
  note: string;
  source: FactorBreakdown["source"];
} {
  const price = btc?.price ?? 0;
  const ema50 = btc?.indicators?.ema50 ?? 0;
  const ema200 = btc?.indicators?.ema200 ?? 0;
  if (!(price > 0) || !(ema50 > 0) || !(ema200 > 0)) {
    return { score: 50, note: "50D / 200D EMA n/a", source: "mock" };
  }
  const d50 = ((price - ema50) / ema50) * 100;
  const d200 = ((price - ema200) / ema200) * 100;
  const score = Math.round(
    clamp(mapRange(d50, -18, 22, 8, 94) * 0.55 + mapRange(d200, -24, 40, 8, 94) * 0.45, 0, 100),
  );
  const sign50 = d50 >= 0 ? "+" : "";
  const sign200 = d200 >= 0 ? "+" : "";
  return {
    score,
    note: `EMA ${sign50}${d50.toFixed(1)}% vs 50D · ${sign200}${d200.toFixed(1)}% vs 200D`,
    source: "live",
  };
}

function sentimentScore(btc: TokenMarketSnapshot | undefined): {
  score: number;
  note: string;
  source: FactorBreakdown["source"];
} {
  const price = btc?.price ?? 0;
  const closes = btc?.dailyCandles ?? [];
  if (!(price > 0) || closes.length < 8) {
    return { score: 50, note: "7d / 30d momentum n/a", source: "mock" };
  }
  const d7 = closes[closes.length - 8]?.close ?? 0;
  const d30 = closes.length > 30 ? (closes[closes.length - 31]?.close ?? 0) : 0;
  const r7 = d7 > 0 ? ((price - d7) / d7) * 100 : Number.NaN;
  const r30 = d30 > 0 ? ((price - d30) / d30) * 100 : Number.NaN;
  const s7 = Number.isFinite(r7) ? mapRange(r7, -18, 28, 12, 92) : Number.NaN;
  const s30 = Number.isFinite(r30) ? mapRange(r30, -28, 45, 12, 92) : Number.NaN;
  const parts = [s7, s30].filter((value) => Number.isFinite(value));
  if (parts.length === 0) {
    return { score: 50, note: "7d / 30d momentum n/a", source: "mock" };
  }
  const score = Math.round(
    clamp(parts.length === 2 ? (s7 as number) * 0.6 + (s30 as number) * 0.4 : parts[0], 0, 100),
  );
  const n7 = Number.isFinite(r7) ? `${r7 >= 0 ? "+" : ""}${r7.toFixed(1)}% 7d` : "7d n/a";
  const n30 = Number.isFinite(r30) ? `${r30 >= 0 ? "+" : ""}${r30.toFixed(1)}% 30d` : "30d n/a";
  return { score, note: `${n7} · ${n30}`, source: "live" };
}

function momentumScore(btc: TokenMarketSnapshot | undefined): {
  score: number;
  note: string;
  source: FactorBreakdown["source"];
} {
  const rsi = btc?.indicators?.rsi;
  const price = btc?.price ?? 0;
  const closes = btc?.dailyCandles ?? [];
  const rsiScore = rsi != null && Number.isFinite(rsi) ? clamp(rsi, 0, 100) : Number.NaN;
  let rocScore = Number.NaN;
  if (price > 0 && closes.length > 20) {
    const base = closes[closes.length - 21]?.close ?? 0;
    if (base > 0) rocScore = clamp(mapRange(((price - base) / base) * 100, -22, 38, 10, 92), 0, 100);
  }
  if (!Number.isFinite(rsiScore) && !Number.isFinite(rocScore)) {
    return { score: 50, note: "RSI / 20d ROC n/a", source: "mock" };
  }
  const score = Math.round(
    clamp(
      Number.isFinite(rsiScore) && Number.isFinite(rocScore)
        ? (rsiScore as number) * 0.7 + (rocScore as number) * 0.3
        : Number.isFinite(rsiScore)
          ? (rsiScore as number)
          : (rocScore as number),
      0,
      100,
    ),
  );
  const rsiNote = Number.isFinite(rsiScore) ? `RSI ${rsiScore.toFixed(0)}` : "RSI n/a";
  return { score, note: `${rsiNote} · 20d ROC`, source: Number.isFinite(rsiScore) ? "live" : "mock" };
}

function riskScore(btc: TokenMarketSnapshot | undefined): {
  score: number;
  note: string;
  source: FactorBreakdown["source"];
} {
  const candles = btc?.dailyCandles ?? [];
  const volumes = candles.map((candle) => candle.volume);
  const lastVol = volumes[volumes.length - 1] ?? 0;
  const avg = computeVolumeSma(volumes, 20);
  if (!(lastVol > 0) || !(avg > 0)) {
    return { score: 50, note: "Objem 20d n/a", source: "mock" };
  }
  const ratio = lastVol / avg;
  const score = Math.round(clamp(mapRange(ratio, 0.35, 2.4, 88, 18), 0, 100));
  return {
    score,
    note: `Objem ${ratio.toFixed(2)}× 20d priemeru`,
    source: "live",
  };
}

function regimeAffinities(scores: Record<RegimeFactorId, number>): Record<RegimeKind, number> {
  const { valuation, trend, sentiment, momentum, risk } = scores;
  return {
    PANIC: (100 - sentiment) * 0.4 + risk * 0.35 + (100 - trend) * 0.25,
    BEAR: (100 - valuation) * 0.3 + (100 - trend) * 0.4 + (100 - momentum) * 0.3,
    SIDEWAYS: Math.max(
      0,
      100 - Math.abs(valuation - 50) * 0.35 - Math.abs(trend - 50) * 0.35 - Math.abs(sentiment - 50) * 0.3,
    ),
    BULL: trend * 0.4 + valuation * 0.3 + momentum * 0.3,
    EUPHORIA: sentiment * 0.35 + valuation * 0.35 + momentum * 0.3,
  };
}

function interpolateWeights(blend: Record<RegimeKind, number>): Record<RegimeFactorId, number> {
  const ids: RegimeFactorId[] = ["valuation", "trend", "sentiment", "momentum", "risk"];
  const raw: Record<RegimeFactorId, number> = {
    valuation: 0,
    trend: 0,
    sentiment: 0,
    momentum: 0,
    risk: 0,
  };
  for (const kind of REGIME_ORDER) {
    const share = blend[kind] ?? 0;
    for (const id of ids) raw[id] += share * REGIME_WEIGHTS[kind][id];
  }
  const sum = ids.reduce((acc, id) => acc + raw[id], 0);
  if (sum <= 0) return { ...PHASE_A_WEIGHTS };
  for (const id of ids) raw[id] = raw[id] / sum;
  return raw;
}

export function calculateDeploymentScore(
  btc: TokenMarketSnapshot | undefined,
  _metrics: RegimeMetrics | undefined,
  moneyMode: boolean,
): DeploymentDecision {
  void _metrics;
  const valuation = valuationScore(btc);
  const trend = trendScore(btc);
  const sentiment = sentimentScore(btc);
  const momentum = momentumScore(btc);
  const risk = riskScore(btc);

  const rawScores: Record<RegimeFactorId, number> = {
    valuation: valuation.score,
    trend: trend.score,
    sentiment: sentiment.score,
    momentum: momentum.score,
    risk: risk.score,
  };
  const affinities = regimeAffinities(rawScores);
  const mix = softmax(REGIME_ORDER.map((kind) => affinities[kind] / SOFTMAX_TEMPERATURE));
  const blendMap = Object.fromEntries(
    REGIME_ORDER.map((kind, index) => [kind, mix[index] ?? 0]),
  ) as Record<RegimeKind, number>;
  const weights = interpolateWeights(blendMap);
  const blend: RegimeBlendShare[] = REGIME_ORDER.map((kind, index) => ({
    kind,
    label: REGIME_COPY[kind].label,
    percent: Math.round((mix[index] ?? 0) * 1000) / 10,
  })).filter((row) => row.percent >= 1);

  const factorMeta: Array<Omit<FactorBreakdown, "weight" | "contribution" | "formula">> = [
    { id: "valuation", label: "Valuácia", ...valuation },
    { id: "trend", label: "Trend", ...trend },
    { id: "sentiment", label: "Sentiment", ...sentiment },
    { id: "momentum", label: "Momentum", ...momentum },
    { id: "risk", label: "Riziko / likvidita", ...risk },
  ];
  const factors: FactorBreakdown[] = factorMeta.map((factor) => {
    const weight = weights[factor.id];
    const contribution = Math.round(factor.score * weight * 10) / 10;
    return {
      ...factor,
      source: blendSource(factor),
      weight,
      contribution,
      formula: `${factor.score} × ${(weight * 100).toFixed(1)}% = ${contribution.toFixed(1)} bodov`,
    };
  });

  const weighted = factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0);
  const heat = clamp(weighted + (moneyMode ? 3 : 0), 0, 100);
  const score = Math.round(heat);
  const allocationPercent = allocationFromHeat(heat);
  const primary = REGIME_ORDER.reduce((best, kind) =>
    (blendMap[kind] ?? 0) > (blendMap[best] ?? 0) ? kind : best,
  );
  const copy = REGIME_COPY[primary];
  const spread = factors.map((factor) => factor.score);
  const mean = spread.reduce((sum, value) => sum + value, 0) / spread.length;
  const stdev = Math.sqrt(spread.reduce((sum, value) => sum + (value - mean) ** 2, 0) / spread.length);
  const confidence: ConfidenceLevel = stdev < 12 ? "Vysoká" : stdev < 22 ? "Stredná" : "Nízka";
  const confidenceMultiplier = Math.round(lerp(1, 0.72, smoothstep(8, 30, stdev)) * 100) / 100;

  return {
    kind: primary,
    englishKind: copy.english,
    label: copy.label,
    description: copy.description,
    score,
    allocationPercent,
    heat,
    confidence,
    confidenceMultiplier,
    blend,
    notes: factors.map((factor) => factor.note),
    factors,
  };
}

export function applyDeploymentCapital(
  baseAmount: number,
  allocationPercent: number,
): { deployedCapital: number; undeployedToReserve: number } {
  const base = Math.max(0, baseAmount);
  const pct = clamp(allocationPercent, 0, 100);
  const deployedCapital = roundUsd(base * (pct / 100));
  const undeployedToReserve = roundUsd(base - deployedCapital);
  return { deployedCapital, undeployedToReserve };
}

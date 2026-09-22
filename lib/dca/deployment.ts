import { ATR } from "technicalindicators";
import { REGIME_COPY, REGIME_ORDER } from "@/lib/dca/confluence";
import { computeSma } from "@/lib/dca/indicators";
import { clamp, lerp, roundUsd, smoothstep, softmax } from "@/lib/dca/math";
import type {
  ConfidenceLevel,
  DeploymentDecision,
  RegimeBlendShare,
  RegimeKind,
  RegimeMetrics,
  TokenMarketSnapshot,
} from "@/lib/dca/types";

/**
 * Phase A — How Much.
 * Macro-trend heat (0 = panic, 100 = euphoria) maps continuously to
 * allocation % of the user base amount. Distinct from 5-factor CONFLUENCE.
 *
 * Knot at heat 47 → 48% matches the master $431 example (SIDEWAYS).
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

const REGIME_CENTERS: Record<RegimeKind, number> = {
  PANIC: 8,
  BEAR: 28,
  SIDEWAYS: 50,
  BULL: 70,
  EUPHORIA: 92,
};

const HEAT_SOFTMAX_TEMP = 10;

function mapRange(
  value: number,
  fromLow: number,
  fromHigh: number,
  toLow: number,
  toHigh: number,
): number {
  if (!Number.isFinite(value)) return (toLow + toHigh) / 2;
  const t = (value - fromLow) / (fromHigh - fromLow);
  return lerp(toLow, toHigh, t);
}

function lastAtrPercent(candles: TokenMarketSnapshot["dailyCandles"], price: number): number {
  if (!(price > 0) || candles.length < 20) return Number.NaN;
  const period = candles.length >= 45 ? 30 : 14;
  const series = ATR.calculate({
    period,
    high: candles.map((candle) => candle.high),
    low: candles.map((candle) => candle.low),
    close: candles.map((candle) => candle.close),
  });
  const atr = series[series.length - 1];
  if (!(atr > 0)) return Number.NaN;
  return (atr / price) * 100;
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

function trendHeat(btc: TokenMarketSnapshot | undefined): { score: number; note: string } {
  const price = btc?.price ?? 0;
  const ema50 = btc?.indicators?.ema50 ?? 0;
  const ema200 = btc?.indicators?.ema200 ?? 0;
  if (!(price > 0) || !(ema50 > 0) || !(ema200 > 0)) {
    return { score: 50, note: "50D / 200D EMA n/a" };
  }
  const d50 = ((price - ema50) / ema50) * 100;
  const d200 = ((price - ema200) / ema200) * 100;
  const score = clamp(mapRange(d50, -18, 22, 10, 92) * 0.55 + mapRange(d200, -24, 40, 10, 92) * 0.45, 0, 100);
  const sign50 = d50 >= 0 ? "+" : "";
  const sign200 = d200 >= 0 ? "+" : "";
  return {
    score,
    note: `Trend ${sign50}${d50.toFixed(1)}% vs 50D · ${sign200}${d200.toFixed(1)}% vs 200D`,
  };
}

function cycleHeat(btc: TokenMarketSnapshot | undefined): { score: number; note: string } {
  const price = btc?.price ?? 0;
  const weekly = btc?.weeklyCandles ?? [];
  const sma200w = computeSma(weekly.map((candle) => candle.close), 200);
  if (!(price > 0) || !(sma200w > 0)) {
    return { score: 50, note: "200W SMA n/a" };
  }
  const dev = ((price - sma200w) / sma200w) * 100;
  const score = clamp(mapRange(dev, -40, 100, 12, 94), 0, 100);
  const sign = dev >= 0 ? "+" : "";
  return { score, note: `Cyklus ${sign}${dev.toFixed(1)}% vs 200W SMA` };
}

function sentimentHeat(metrics: RegimeMetrics | undefined): { score: number; note: string } {
  const value = metrics?.fearGreed;
  if (value == null || !Number.isFinite(value)) {
    return { score: 50, note: "Fear & Greed n/a" };
  }
  const label = metrics?.fearGreedLabel ? `${metrics.fearGreedLabel} · ` : "";
  return { score: clamp(value, 0, 100), note: `${label}${value.toFixed(0)}/100 F&G` };
}

function volatilityHeat(btc: TokenMarketSnapshot | undefined): { score: number; note: string } {
  const atrPct = lastAtrPercent(btc?.dailyCandles ?? [], btc?.price ?? 0);
  if (!Number.isFinite(atrPct)) {
    return { score: 50, note: "ATR n/a" };
  }
  const score = clamp(mapRange(atrPct, 1.1, 7.5, 78, 18), 0, 100);
  return { score, note: `Volatilita ATR ~${atrPct.toFixed(2)}%` };
}

function cbbiHeat(metrics: RegimeMetrics | undefined, cycle: number, sentiment: number): { score: number; note: string } {
  const cbbi = metrics?.cbbi;
  if (cbbi != null && Number.isFinite(cbbi) && !metrics?.cbbiMock) {
    return { score: clamp(cbbi, 0, 100), note: `CBBI ${cbbi.toFixed(0)}/100` };
  }
  const blended = clamp(cycle * 0.55 + sentiment * 0.45, 0, 100);
  return { score: blended, note: "CBBI mock z cyklu + F&G" };
}

export function calculateDeploymentScore(
  btc: TokenMarketSnapshot | undefined,
  metrics: RegimeMetrics | undefined,
  moneyMode: boolean,
): DeploymentDecision {
  const trend = trendHeat(btc);
  const cycle = cycleHeat(btc);
  const sentiment = sentimentHeat(metrics);
  const vol = volatilityHeat(btc);
  const cbbi = cbbiHeat(metrics, cycle.score, sentiment.score);

  const raw =
    trend.score * 0.32 +
    cycle.score * 0.18 +
    sentiment.score * 0.22 +
    vol.score * 0.12 +
    cbbi.score * 0.16;
  const heat = clamp(raw + (moneyMode ? 3 : 0), 0, 100);
  const score = Math.round(heat);
  const allocationPercent = allocationFromHeat(heat);

  const affinities = REGIME_ORDER.map((kind) => {
    const distance = Math.abs(heat - REGIME_CENTERS[kind]);
    return -distance / HEAT_SOFTMAX_TEMP;
  });
  const mix = softmax(affinities);
  const blend: RegimeBlendShare[] = REGIME_ORDER.map((kind, index) => ({
    kind,
    label: REGIME_COPY[kind].label,
    percent: Math.round((mix[index] ?? 0) * 1000) / 10,
  })).filter((row) => row.percent >= 1);
  const primary = REGIME_ORDER.reduce((best, kind, index) =>
    (mix[index] ?? 0) > (mix[REGIME_ORDER.indexOf(best)] ?? 0) ? kind : best,
  );
  const copy = REGIME_COPY[primary];

  const parts = [trend.score, cycle.score, sentiment.score, vol.score, cbbi.score];
  const mean = parts.reduce((sum, value) => sum + value, 0) / parts.length;
  const stdev = Math.sqrt(parts.reduce((sum, value) => sum + (value - mean) ** 2, 0) / parts.length);
  const confidence: ConfidenceLevel =
    stdev < 12 ? "Vysoká" : stdev < 22 ? "Stredná" : "Nízka";
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
    notes: [trend.note, cycle.note, sentiment.note, vol.note, cbbi.note],
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

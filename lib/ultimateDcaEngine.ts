import type { ConfidenceLevel, FactorScore } from "@/lib/masterDcaEngine";

export type MacroRegime =
  | "CAPITULATION"
  | "BEAR"
  | "SIDEWAYS"
  | "BULL"
  | "EUPHORIA";

export interface OhlcBar {
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MacroIndicators {
  price: number;
  sma200d: number;
  wma200w: number;
  ema50: number;
  ema200: number;
  rsi14: number;
  atr14Pct: number;
  sentiment: number;
  distSmaPct: number;
  distWmaPct: number;
}

export const FACTOR_WEIGHTS = {
  value: 0.3,
  trend: 0.2,
  sentiment: 0.2,
  momentum: 0.15,
  risk: 0.15,
} as const;

export const CONFIDENCE_MULTIPLIERS: Record<ConfidenceLevel, number> = {
  high: 1.0,
  medium: 0.93,
  low: 0.85,
};

const HYSTERESIS = 0.03;
const REGIME_STORAGE_KEY = "edge-trader-dca-macro-regime";

const REGIME_META: Record<
  MacroRegime,
  { label: string; description: string; confidence: ConfidenceLevel }
> = {
  CAPITULATION: {
    label: "CAPITULATION",
    description: "Panický výpredaj — dlhodobá akumulácia",
    confidence: "low",
  },
  BEAR: {
    label: "BEAR",
    description: "Medvedí trend pod 200D SMA",
    confidence: "high",
  },
  SIDEWAYS: {
    label: "SIDEWAYS",
    description: "Bočný pohyb okolo 200D SMA",
    confidence: "high",
  },
  BULL: {
    label: "BULL",
    description: "Býčí trend — Golden Cross",
    confidence: "high",
  },
  EUPHORIA: {
    label: "EUPHORIA",
    description: "Euforia — defenzívna alokácia",
    confidence: "medium",
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Linear map: value at `low` → scoreHigh, value at `high` → scoreLow */
export function lerpScore(
  value: number,
  low: number,
  high: number,
  scoreAtLow: number,
  scoreAtHigh: number,
): number {
  if (high === low) return (scoreAtLow + scoreAtHigh) / 2;
  const t = clamp((value - low) / (high - low), 0, 1);
  return scoreAtLow + t * (scoreAtHigh - scoreAtLow);
}

export function computeSma(values: number[], period: number): number {
  const slice = values.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

export function computeEma(values: number[], period: number): number {
  if (values.length < period) return 0;
  const k = 2 / (period + 1);
  let ema = values.slice(0, period).reduce((sum, v) => sum + v, 0) / period;
  for (let i = period; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

export function computeRsi14(closes: number[]): number {
  if (closes.length < 16) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= 14; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  let avgGain = gains / 14;
  let avgLoss = losses / 14;
  for (let i = 15; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const g = d > 0 ? d : 0;
    const l = d < 0 ? -d : 0;
    avgGain = (avgGain * 13 + g) / 14;
    avgLoss = (avgLoss * 13 + l) / 14;
  }
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return clamp(100 - 100 / (1 + rs), 0, 100);
}

export function computeAtr14Pct(bars: OhlcBar[]): number {
  if (bars.length < 16) return 2;
  const trs: number[] = [];
  for (let i = bars.length - 14; i < bars.length; i++) {
    const h = bars[i].high;
    const l = bars[i].low;
    const pc = bars[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    if (pc > 0) trs.push((tr / pc) * 100);
  }
  return trs.length > 0
    ? trs.reduce((sum, v) => sum + v, 0) / trs.length
    : 2;
}

export function buildMacroIndicators(
  dailyBars: OhlcBar[],
  weeklyCloses: number[],
  sentiment: number,
): MacroIndicators {
  const closes = dailyBars.map((b) => b.close);
  const price = closes[closes.length - 1];
  const sma200d = computeSma(closes, 200);
  const ema50 = computeEma(closes, 50);
  const ema200 = computeEma(closes, 200);
  const wma200w =
    weeklyCloses.length >= 200
      ? computeSma(weeklyCloses, 200)
      : computeSma(weeklyCloses, weeklyCloses.length);

  return {
    price,
    sma200d,
    wma200w: wma200w || price,
    ema50,
    ema200,
    rsi14: computeRsi14(closes),
    atr14Pct: computeAtr14Pct(dailyBars),
    sentiment,
    distSmaPct: sma200d > 0 ? ((price - sma200d) / sma200d) * 100 : 0,
    distWmaPct: wma200w > 0 ? ((price - wma200w) / wma200w) * 100 : 0,
  };
}

function readPreviousRegime(): MacroRegime | null {
  if (typeof window === "undefined") return null;
  const stored = sessionStorage.getItem(REGIME_STORAGE_KEY);
  if (
    stored === "CAPITULATION" ||
    stored === "BEAR" ||
    stored === "SIDEWAYS" ||
    stored === "BULL" ||
    stored === "EUPHORIA"
  ) {
    return stored;
  }
  return null;
}

function persistRegime(regime: MacroRegime): void {
  if (typeof window !== "undefined") {
    sessionStorage.setItem(REGIME_STORAGE_KEY, regime);
  }
}

export function resolveMacroRegime(indicators: MacroIndicators): MacroRegime {
  const prev = readPreviousRegime();
  const { distSmaPct, distWmaPct, ema50, ema200, sentiment } = indicators;
  const h = HYSTERESIS * 100;

  let regime: MacroRegime;

  if (distWmaPct < -10 && sentiment < 20) {
    regime = "CAPITULATION";
  } else if (distWmaPct > 15 && sentiment > 85) {
    regime = "EUPHORIA";
  } else if (Math.abs(distSmaPct) <= 5 + (prev === "SIDEWAYS" ? h : 0)) {
    regime = "SIDEWAYS";
  } else if (
    distSmaPct > (prev === "BULL" ? -h : h) &&
    ema50 > ema200 * (prev === "BULL" ? 1 - HYSTERESIS : 1 + HYSTERESIS)
  ) {
    regime = "BULL";
  } else if (distSmaPct < (prev === "BEAR" ? h : -h)) {
    regime = "BEAR";
  } else {
    regime = distSmaPct < 0 ? "BEAR" : "SIDEWAYS";
  }

  persistRegime(regime);
  return regime;
}

export function computeFactorScores(indicators: MacroIndicators): {
  value: number;
  trend: number;
  sentiment: number;
  momentum: number;
  risk: number;
} {
  const { distSmaPct, distWmaPct, ema50, ema200, rsi14, atr14Pct, sentiment } =
    indicators;

  const avgDist = (distSmaPct + distWmaPct) / 2;
  const value = lerpScore(avgDist, -30, 30, 100, 0);

  const crossPct = ema200 > 0 ? ((ema50 - ema200) / ema200) * 100 : 0;
  const trendFromCross = lerpScore(crossPct, -12, 12, 100, 0);
  const trendFromPrice = lerpScore(distSmaPct, -25, 25, 100, 0);
  const trend = (trendFromCross + trendFromPrice) / 2;

  const sentimentScore = lerpScore(sentiment, 0, 100, 100, 0);
  const momentum = lerpScore(rsi14, 20, 80, 100, 0);
  const risk = lerpScore(atr14Pct, 1, 8, 100, 0);

  return { value, trend, sentiment: sentimentScore, momentum, risk };
}

export function computeFinalScore(factors: {
  value: number;
  trend: number;
  sentiment: number;
  momentum: number;
  risk: number;
}): number {
  return (
    factors.value * FACTOR_WEIGHTS.value +
    factors.trend * FACTOR_WEIGHTS.trend +
    factors.sentiment * FACTOR_WEIGHTS.sentiment +
    factors.momentum * FACTOR_WEIGHTS.momentum +
    factors.risk * FACTOR_WEIGHTS.risk
  );
}

export interface UltimateDcaOutput {
  regime: MacroRegime;
  regimeLabel: string;
  regimeDescription: string;
  indicators: MacroIndicators;
  factors: FactorScore[];
  finalScoreRaw: number;
  finalScoreDisplay: number;
  baseAllocationRaw: number;
  baseAllocationDisplay: number;
  allocationRaw: number;
  allocationDisplay: number;
  confidence: ConfidenceLevel;
  confidenceMultiplier: number;
  deployedCapital: number;
  reserveCapital: number;
  brakeActive: boolean;
}

export function computeUltimateDca(input: {
  dailyBars: OhlcBar[];
  weeklyCloses: number[];
  sentiment: number;
  sentimentLabel: string;
  weeklyBudget: number;
}): UltimateDcaOutput {
  const indicators = buildMacroIndicators(
    input.dailyBars,
    input.weeklyCloses,
    input.sentiment,
  );
  const regime = resolveMacroRegime(indicators);
  const meta = REGIME_META[regime];
  const factorValues = computeFactorScores(indicators);
  const finalScoreRaw = computeFinalScore(factorValues);
  const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[meta.confidence];

  const baseAllocationRaw = clamp(82 - finalScoreRaw * 0.62, 22, 80);
  const allocationRaw = baseAllocationRaw * confidenceMultiplier;

  const deployedCapital =
    Math.round(input.weeklyBudget * (allocationRaw / 100) * 100) / 100;
  const reserveCapital =
    Math.round((input.weeklyBudget - deployedCapital) * 100) / 100;

  const brakeActive = indicators.distWmaPct > 40;

  const factors: FactorScore[] = [
    {
      id: "value",
      name: "VALUE",
      score: Math.round(factorValues.value),
      status: `${indicators.distSmaPct.toFixed(1)}% vs 200D`,
      weight: FACTOR_WEIGHTS.value,
    },
    {
      id: "trend",
      name: "TREND",
      score: Math.round(factorValues.trend),
      status:
        indicators.ema50 > indicators.ema200 ? "Golden Cross" : "Below EMAs",
      weight: FACTOR_WEIGHTS.trend,
    },
    {
      id: "sentiment",
      name: "SENTIMENT",
      score: Math.round(factorValues.sentiment),
      status: input.sentimentLabel,
      weight: FACTOR_WEIGHTS.sentiment,
    },
    {
      id: "momentum",
      name: "MOMENTUM",
      score: Math.round(factorValues.momentum),
      status: `RSI ${indicators.rsi14.toFixed(0)}`,
      weight: FACTOR_WEIGHTS.momentum,
    },
    {
      id: "risk",
      name: "RISK",
      score: Math.round(factorValues.risk),
      status: `ATR ${indicators.atr14Pct.toFixed(1)}%`,
      weight: FACTOR_WEIGHTS.risk,
    },
  ];

  return {
    regime,
    regimeLabel: meta.label,
    regimeDescription: meta.description,
    indicators,
    factors,
    finalScoreRaw,
    finalScoreDisplay: Math.round(finalScoreRaw),
    baseAllocationRaw,
    baseAllocationDisplay: Math.round(baseAllocationRaw * 10) / 10,
    allocationRaw,
    allocationDisplay: Math.round(allocationRaw * 10) / 10,
    confidence: meta.confidence,
    confidenceMultiplier,
    deployedCapital,
    reserveCapital,
    brakeActive,
  };
}

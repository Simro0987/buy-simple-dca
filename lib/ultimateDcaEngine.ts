import type { ConfidenceLevel, FactorScore } from "@/lib/masterDcaEngine";
import {
  applyConfidenceMultiplier,
  buildMarketTechnicals,
  computeBaseAllocation,
  computeFinalScoreRaw,
  computeRawFactorScores,
  FACTOR_WEIGHTS,
  type MarketTechnicals,
} from "@/lib/dcaScoringEngine";
import { computeEma, type OhlcBar } from "@/lib/dcaTechnicalIndicators";

export type { OhlcBar };

export type MacroRegime =
  | "CAPITULATION"
  | "BEAR"
  | "SIDEWAYS"
  | "BULL"
  | "EUPHORIA";

export interface MacroIndicators extends MarketTechnicals {
  ema200: number;
  sentiment: number;
}

export { FACTOR_WEIGHTS };

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

export function buildMacroIndicators(
  dailyBars: OhlcBar[],
  weeklyCloses: number[],
  sentiment: number,
): MacroIndicators {
  const technicals = buildMarketTechnicals(dailyBars, weeklyCloses);
  const closes = dailyBars.map((b) => b.close);
  const ema200 = computeEma(closes, 200);

  return {
    ...technicals,
    ema200,
    sentiment,
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
  const factorValues = computeRawFactorScores(indicators, input.sentiment);
  const finalScoreRaw = computeFinalScoreRaw(factorValues);
  const confidenceMultiplier = CONFIDENCE_MULTIPLIERS[meta.confidence];

  const baseAllocationRaw = computeBaseAllocation(finalScoreRaw);
  const allocationRaw = applyConfidenceMultiplier(
    baseAllocationRaw,
    confidenceMultiplier,
  );

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
      status: `${indicators.distSmaPct.toFixed(1)}% vs 200D SMA`,
      weight: FACTOR_WEIGHTS.value,
    },
    {
      id: "trend",
      name: "TREND",
      score: Math.round(factorValues.trend),
      status: `EMA50 ${indicators.ema50VsSma200Pct >= 0 ? "+" : ""}${indicators.ema50VsSma200Pct.toFixed(1)}% vs SMA200`,
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
      status: `RSI ${indicators.rsi14.toFixed(1)}`,
      weight: FACTOR_WEIGHTS.momentum,
    },
    {
      id: "risk",
      name: "RISK",
      score: Math.round(factorValues.risk),
      status: `ATR ${indicators.atr14Pct.toFixed(2)}%`,
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

import { clamp, lerp } from "@/lib/dca/math";
import type {
  ConfidenceLevel,
  FactorBreakdown,
  MarketRegime,
  RegimeKind,
  TokenMarketSnapshot,
} from "@/lib/dca/types";

function confidenceFromSpread(scores: number[]): {
  level: ConfidenceLevel;
  multiplier: number;
} {
  if (scores.length === 0) {
    return { level: "Stredná", multiplier: 0.92 };
  }
  const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
  const variance =
    scores.reduce((sum, score) => sum + (score - mean) ** 2, 0) / scores.length;
  const stdev = Math.sqrt(variance);

  if (stdev < 12) return { level: "Vysoká", multiplier: 1.05 };
  if (stdev < 22) return { level: "Stredná", multiplier: 0.92 };
  return { level: "Nízka", multiplier: 0.78 };
}

export function buildMarketRegime(
  btc: TokenMarketSnapshot | undefined,
  moneyMode: boolean,
): MarketRegime {
  const price = btc?.price ?? 0;
  const ind = btc?.indicators;
  const rsi = ind?.rsi ?? 50;
  const smaDev = ind?.sma200DevPct ?? 0;
  const emaDev = ind?.ema50DevPct ?? 0;
  const atrPct =
    ind && price > 0 && ind.atr > 0 ? (ind.atr / price) * 100 : 3.2;

  let kind: RegimeKind = "SIDEWAYS";
  if (ind && price > ind.sma200 && ind.ema50 >= ind.sma200) kind = "BULL";
  else if (ind && price < ind.sma200 && ind.ema50 <= ind.sma200) kind = "BEAR";

  const valueScore = clamp(100 - (smaDev + 8) * 2.4, 8, 96);
  const trendScore =
    kind === "BULL" ? 78 : kind === "BEAR" ? 28 : 52;
  const sentimentScore = clamp(100 - rsi, 5, 95);
  const momentumScore = clamp(55 - emaDev * 1.8, 12, 92);
  const riskScore = clamp(88 - atrPct * 8, 18, 90);

  const weightMap: Record<RegimeKind, [number, number, number, number, number]> = {
    BULL: [0.14, 0.32, 0.16, 0.22, 0.16],
    SIDEWAYS: [0.22, 0.18, 0.2, 0.18, 0.22],
    BEAR: [0.3, 0.12, 0.24, 0.14, 0.2],
  };
  const [wValue, wTrend, wSent, wMom, wRisk] = weightMap[kind];

  const factors: FactorBreakdown[] = [
    {
      id: "value",
      label: "Value",
      score: Math.round(valueScore),
      weight: wValue,
      note: smaDev < 0 ? "Cena pod 200D SMA" : "Cena nad 200D SMA",
    },
    {
      id: "trend",
      label: "Trend",
      score: Math.round(trendScore),
      weight: wTrend,
      note:
        kind === "BULL"
          ? "EMA 50 nad SMA 200"
          : kind === "BEAR"
            ? "EMA 50 pod SMA 200"
            : "EMA a SMA bez jasného smeru",
    },
    {
      id: "sentiment",
      label: "Sentiment",
      score: Math.round(sentimentScore),
      weight: wSent,
      note: `RSI ${rsi.toFixed(0)}`,
    },
    {
      id: "momentum",
      label: "Momentum",
      score: Math.round(momentumScore),
      weight: wMom,
      note: `Odchýlka od 50D EMA ${emaDev.toFixed(1)}%`,
    },
    {
      id: "risk",
      label: "Risk",
      score: Math.round(riskScore),
      weight: wRisk,
      note: `ATR ${atrPct.toFixed(1)}%`,
    },
  ];

  const weighted =
    valueScore * wValue +
    trendScore * wTrend +
    sentimentScore * wSent +
    momentumScore * wMom +
    riskScore * wRisk;

  const { level, multiplier } = confidenceFromSpread(factors.map((f) => f.score));
  const finalScore = Math.round(clamp(weighted * (moneyMode ? 1.04 : 1), 5, 97));
  const allocationPercent = Math.round(
    clamp(lerp(32, 88, finalScore / 100) * multiplier * (moneyMode ? 1.06 : 1), 28, 100),
  );

  const copy: Record<
    RegimeKind,
    { label: string; description: string }
  > = {
    BULL: { label: "BULL", description: "Býčí trend" },
    BEAR: { label: "BEAR", description: "Medvedí trend" },
    SIDEWAYS: { label: "SIDEWAYS", description: "Bočný pohyb" },
  };

  return {
    kind,
    label: copy[kind].label,
    description: copy[kind].description,
    finalScore,
    allocationPercent,
    confidence: level,
    confidenceMultiplier: multiplier,
    factors,
  };
}

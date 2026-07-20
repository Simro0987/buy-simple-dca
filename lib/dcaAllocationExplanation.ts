import type { ConfidenceLevel, FactorScore } from "@/lib/masterDcaEngine";

export function hasDivergentFactors(factors: FactorScore[]): boolean {
  if (factors.length === 0) return false;
  const scores = factors.map((f) => f.score);
  return Math.max(...scores) - Math.min(...scores) >= 35;
}

const CONFIDENCE_LABELS: Record<ConfidenceLevel, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

function fmt(value: number): string {
  return value.toFixed(2);
}

export function buildAllocationExplanation(input: {
  regimeLabel: string;
  confluenceScore: number;
  baseAllocationPercent: number;
  allocationPercent: number;
  dynamicAnchor: number;
  dynamicSlope: number;
  confidence: ConfidenceLevel;
  confidenceMultiplier: number;
  factors: FactorScore[];
}): string {
  const {
    regimeLabel,
    confluenceScore,
    baseAllocationPercent,
    allocationPercent,
    dynamicAnchor,
    dynamicSlope,
    confidence,
    confidenceMultiplier,
    factors,
  } = input;

  const divergent = hasDivergentFactors(factors);
  const divergentNote = divergent ? " (rozporné faktory)" : "";

  return `Režim ${regimeLabel} • skóre ${confluenceScore}/100.
Vyhladená alokácia: ${fmt(dynamicAnchor)} − (skóre × ${fmt(dynamicSlope)}) • z ${baseAllocationPercent} % na ${allocationPercent} %${divergentNote}.

Vzorec: Allocation % = ${fmt(dynamicAnchor)} - (Score × ${fmt(dynamicSlope)}). Strop odvodený od 200WMA, sila brzdy od ATR (volatility). Clamp [22 %, 80 %]. Confidence: ${CONFIDENCE_LABELS[confidence]} ×${confidenceMultiplier.toFixed(2)}.`;
}

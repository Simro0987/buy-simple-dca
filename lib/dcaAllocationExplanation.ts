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

export function buildAllocationExplanation(input: {
  regimeLabel: string;
  confluenceScore: number;
  baseAllocationPercent: number;
  allocationPercent: number;
  confidence: ConfidenceLevel;
  confidenceMultiplier: number;
  factors: FactorScore[];
  fearGreedValue: number;
}): string {
  const {
    regimeLabel,
    confluenceScore,
    baseAllocationPercent,
    allocationPercent,
    confidence,
    confidenceMultiplier,
    factors,
    fearGreedValue,
  } = input;

  const divergent = hasDivergentFactors(factors);
  const divergentNote = divergent ? " (rozporné faktory)" : "";

  const overrideLines: string[] = [];
  if (fearGreedValue <= 25 && confluenceScore < 15) {
    overrideLines.push(
      `Aktívny override: Panic + skóre < 15 → základná alokácia ${baseAllocationPercent} %.`,
    );
  } else if (fearGreedValue >= 75 && confluenceScore > 90) {
    overrideLines.push(
      `Aktívny override: Eufória + skóre > 90 → základná alokácia ${baseAllocationPercent} %.`,
    );
  }

  const overrideBlock =
    overrideLines.length > 0 ? `\n\n${overrideLines.join(" ")}` : "";

  return `Režim ${regimeLabel} • skóre ${confluenceScore}/100.
Vyhladená alokácia podľa vzorca 82 – skóre×0.62 • z ${baseAllocationPercent} % na ${allocationPercent} %${divergentNote}.

Vzorec: Allocation % = 82 - (Score × 0.62), clamp [22 %, 80 %]. Makro režimy: CAPITULATION (Low ×0.85) • EUPHORIA (Medium ×0.93) • ostatné (High ×1.00). Aktuálne: ${CONFIDENCE_LABELS[confidence]} ×${confidenceMultiplier.toFixed(2)}.${overrideBlock}`;
}

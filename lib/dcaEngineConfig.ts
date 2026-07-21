import type { AssetCategory } from "@/lib/portfolioStorage";
import type { ConfidenceLevel } from "@/lib/masterDcaEngine";

export const DEFAULT_WEEKLY_INVESTMENT = 431;

export const QUICK_AMOUNTS = [50, 100, 200, 500, 1000] as const;

export interface TokenExecutionPlan {
  symbol: string;
  name: string;
  category: AssetCategory;
  logoUrl: string;
  weightPercent: number;
  totalUsd: number;
  marketUsd: number;
  limitUsd: number;
  marketShare: number;
  limitShare: number;
  limitPrice: number;
  whyLimit: string;
  spotPrice: number;
  change24h: number;
  yieldMergeActive: boolean;
  brakeActive: boolean;
  hasLiveData: boolean;
  marketStatusFallback: boolean;
  confidence: ConfidenceLevel;
  entrySignal: string;
  splitExplanation: string;
  minOrderRuleActive: boolean;
  safetyBrakeActive: boolean;
  limitPullbackPct: number;
}

export interface RegimeFactorDisplay {
  id: string;
  label: string;
  value: string;
  score: number;
  signal: "bullish" | "neutral" | "bearish";
}

export function factorToRegimeDisplay(
  id: string,
  name: string,
  score: number,
  status: string,
): RegimeFactorDisplay {
  const signal =
    score >= 65 ? "bullish" : score <= 35 ? "bearish" : "neutral";
  return {
    id,
    label: name.toUpperCase(),
    value: status,
    score,
    signal,
  };
}

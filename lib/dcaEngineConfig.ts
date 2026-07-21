import type { YieldSatelliteMetrics } from "@/lib/yieldSatelliteMetrics";
import type { SupportResistanceLevels } from "@/lib/supportResistanceLevels";
import type { YieldFilterCondition } from "@/lib/dcaYieldFilter";
import type { AssetCategory } from "@/lib/portfolioStorage";
import type { ConfidenceLevel } from "@/lib/masterDcaEngine";
import type {
  RegimeStatusTone,
  TokenIndicatorChip,
} from "@/lib/dcaTokenIndicators";

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
  minOrderMergeActive: boolean;
  mergedExecutionRoute: "market" | "limit" | null;
  mergedTotalUsd: number;
  routerReasoning: string | null;
  brakeActive: boolean;
  hasLiveData: boolean;
  marketStatusFallback: boolean;
  confidence: ConfidenceLevel;
  entrySignal: string;
  splitExplanation: string;
  minOrderRuleActive: boolean;
  safetyBrakeActive: boolean;
  limitPullbackPct: number;
  indicatorChips: TokenIndicatorChip[];
  regimeStatusLabel: string;
  regimeStatusTone: RegimeStatusTone;
  fearGreedValue: number;
  rsi14: number | null;
  atr14dPct: number | null;
  distSma200Pct: number | null;
  ema50DeviationPct: number | null;
  fundamentalScore: number | null;
  filtersPassedCount: number | null;
  filterConditions: YieldFilterCondition[];
  convictionScore: number | null;
  tag: string | null;
  priceVsSma14Pct: number | null;
  shareOfYieldPercent: number | null;
  yieldWeight: number | null;
  yieldSatelliteMetrics: YieldSatelliteMetrics | null;
  supportResistance: SupportResistanceLevels | null;
  supportSnapApplied: boolean;
  supportSnapNote: string | null;
  limitDepthMode: "standard" | "deep_wick" | null;
  limitDepthBadge: string | null;
  limitDepthNarrative: string | null;
  limitValidityDays: number;
  rsiS2BlendPct: number | null;
  limitUsdBase: number | null;
  positionSizeMultiplier: number;
  positionSizeBoostPct: number;
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

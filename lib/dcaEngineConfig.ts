import type { CryptoSymbol } from "@/lib/cryptoApi";
import type { TokenAccent } from "@/lib/dcaData";

export const DEFAULT_WEEKLY_INVESTMENT = 431;

export const ANCHOR_SPLIT: Record<CryptoSymbol, number> = {
  BTC: 64,
  ETH: 25,
  SOL: 11,
};

export interface ExecutionAssetConfig {
  symbol: CryptoSymbol;
  name: string;
  accent: TokenAccent;
  marketShare: number;
  limitShare: number;
}

export const EXECUTION_ASSETS: ExecutionAssetConfig[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    accent: "orange",
    marketShare: 62,
    limitShare: 38,
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    accent: "purple",
    marketShare: 55,
    limitShare: 45,
  },
  {
    symbol: "SOL",
    name: "Solana",
    accent: "cyan",
    marketShare: 48,
    limitShare: 52,
  },
];

export type RegimeSignal = "bullish" | "neutral" | "bearish";

export interface RegimeFactor {
  id: string;
  label: string;
  value: string;
  score: number;
  signal: RegimeSignal;
}

export const MARKET_REGIME_FACTORS: RegimeFactor[] = [
  { id: "wma", label: "200WMA", value: "Support", score: 82, signal: "bullish" },
  {
    id: "fng",
    label: "FEAR & GREED",
    value: "27",
    score: 27,
    signal: "bearish",
  },
  { id: "cbbc", label: "CBBC", value: "Accum", score: 74, signal: "bullish" },
  {
    id: "liq",
    label: "LIKVIDITA",
    value: "High",
    score: 68,
    signal: "bullish",
  },
  {
    id: "vol",
    label: "VOLATILITA",
    value: "Elevated",
    score: 41,
    signal: "neutral",
  },
];

export const QUICK_AMOUNTS = [50, 100, 200, 500, 1000] as const;

export interface TokenExecutionPlan {
  symbol: CryptoSymbol;
  name: string;
  accent: TokenAccent;
  weightPercent: number;
  totalUsd: number;
  marketUsd: number;
  limitUsd: number;
  marketShare: number;
  limitShare: number;
}

export function calculateWeeklyExecution(
  weeklyAmount: number,
): TokenExecutionPlan[] {
  const safeAmount = Math.max(0, weeklyAmount);

  return EXECUTION_ASSETS.map((asset) => {
    const weightPercent = ANCHOR_SPLIT[asset.symbol];
    const totalUsd = safeAmount * (weightPercent / 100);
    const marketUsd = totalUsd * (asset.marketShare / 100);
    const limitUsd = totalUsd * (asset.limitShare / 100);

    return {
      symbol: asset.symbol,
      name: asset.name,
      accent: asset.accent,
      weightPercent,
      totalUsd,
      marketUsd,
      limitUsd,
      marketShare: asset.marketShare,
      limitShare: asset.limitShare,
    };
  });
}

import type { CryptoPricesMap, CryptoSymbol } from "@/lib/cryptoApi";
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

export const WEEKLY_INVESTMENT_STORAGE_KEY = "edge-trader-weekly-dca";

export const TOKEN_SPLIT_COLORS: Record<CryptoSymbol, string> = {
  BTC: "#f97316",
  ETH: "#a855f7",
  SOL: "#22d3ee",
};

export function readWeeklyInvestment(): number {
  if (typeof window === "undefined") return DEFAULT_WEEKLY_INVESTMENT;

  try {
    const raw = window.localStorage.getItem(WEEKLY_INVESTMENT_STORAGE_KEY);
    if (raw == null || raw === "") return DEFAULT_WEEKLY_INVESTMENT;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_WEEKLY_INVESTMENT;
    return Math.round(parsed * 100) / 100;
  } catch {
    return DEFAULT_WEEKLY_INVESTMENT;
  }
}

export function writeWeeklyInvestment(amount: number): void {
  if (typeof window === "undefined") return;
  const safe = Math.max(0, Number.isFinite(amount) ? amount : 0);
  window.localStorage.setItem(
    WEEKLY_INVESTMENT_STORAGE_KEY,
    String(Math.round(safe * 100) / 100),
  );
}

export function hasUsablePrices(prices?: CryptoPricesMap | null): boolean {
  if (!prices) return false;
  return EXECUTION_ASSETS.every((asset) => (prices[asset.symbol]?.price ?? 0) > 0);
}

export function estimateTokenQty(usd: number, unitPrice: number): number {
  if (unitPrice <= 0 || usd <= 0) return 0;
  return usd / unitPrice;
}

export function formatEstimatedQty(amount: number, symbol: CryptoSymbol): string {
  const decimals = symbol === "BTC" ? 6 : symbol === "ETH" ? 5 : 4;
  if (!Number.isFinite(amount) || amount <= 0) return `— ${symbol}`;
  return `${amount.toFixed(decimals)} ${symbol}`;
}

export function getDcaWeekStart(now = new Date()): Date {
  const date = new Date(now);
  const day = date.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + mondayOffset);
  return date;
}

export function isInCurrentDcaWeek(isoDate: string, now = new Date()): boolean {
  const then = new Date(isoDate);
  if (Number.isNaN(then.getTime())) return false;
  return then.getTime() >= getDcaWeekStart(now).getTime();
}

export interface MarketRegimeSummary {
  averageScore: number;
  bullishCount: number;
  bearishCount: number;
  tone: RegimeSignal;
  label: string;
  description: string;
}

export function summarizeMarketRegime(
  factors: RegimeFactor[] = MARKET_REGIME_FACTORS,
): MarketRegimeSummary {
  const count = factors.length || 1;
  const averageScore = Math.round(
    factors.reduce((sum, factor) => sum + factor.score, 0) / count,
  );
  const bullishCount = factors.filter((factor) => factor.signal === "bullish").length;
  const bearishCount = factors.filter((factor) => factor.signal === "bearish").length;

  let tone: RegimeSignal = "neutral";
  let label = "ZMIEŠANÝ";
  let description = "Signály sú rozdelené — drž sa týždenného plánu.";

  if (bullishCount >= 3 && bullishCount > bearishCount) {
    tone = "bullish";
    label = "AKUMULÁCIA";
    description = "Väčšina faktorov podporuje nákup podľa plánu.";
  } else if (bearishCount >= 3 && bearishCount > bullishCount) {
    tone = "bearish";
    label = "OPATRNE";
    description = "Trh je defenzívny — nákup bez FOMO, podľa plánu.";
  }

  return { averageScore, bullishCount, bearishCount, tone, label, description };
}

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

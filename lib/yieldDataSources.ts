import type { AssetCategory } from "@/lib/portfolioStorage";
import { clamp, lerpScore } from "@/lib/dcaTechnicalIndicators";

/** Where APR/APY for yield & satellite tokens was resolved from. */
export type YieldApySource = "portfolio" | "api" | "defillama" | "fallback";

export interface PortfolioYieldHolding {
  symbol: string;
  category: AssetCategory;
  usdValue: number;
  roiPercent: number;
  hasPurchaseHistory: boolean;
}

export interface PortfolioYieldContext {
  holdings: PortfolioYieldHolding[];
}

export interface ResolvedYieldApy {
  symbol: string;
  apyPct: number;
  source: YieldApySource;
  isEstimated: boolean;
  sourceLabel: string;
  fetchedAt?: string;
}

export const YIELD_APY_SOURCE_LABELS: Record<YieldApySource, string> = {
  portfolio: "Portfólio",
  api: "Live API",
  defillama: "DeFiLlama",
  fallback: "Odhad",
};

/** Safe local fallback APY (% p.a.) per token / network when live data is unavailable. */
export const FALLBACK_APY_BY_SYMBOL: Record<
  string,
  { apyPct: number; network: string; label: string }
> = {
  SOL: { apyPct: 6.8, network: "Solana", label: "Solana natívny staking" },
  ETH: { apyPct: 3.9, network: "Ethereum", label: "ETH validátor staking" },
  HYPE: { apyPct: 12.4, network: "Hyperliquid", label: "HYPE staking pool" },
  JUP: { apyPct: 8.6, network: "Solana", label: "Jupiter staked SOL" },
  PENDLE: { apyPct: 14.2, network: "Ethereum", label: "Pendle yield trhy" },
  GMX: { apyPct: 11.5, network: "Arbitrum", label: "GMX GLP / staking" },
  AAVE: { apyPct: 3.8, network: "Ethereum", label: "Aave lending yield" },
  MORPHO: { apyPct: 7.2, network: "Ethereum", label: "Morpho vault yield" },
  LINK: { apyPct: 2.4, network: "Ethereum", label: "Chainlink staking" },
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function getFallbackApy(
  symbol: string,
  category: AssetCategory,
): number {
  return (
    FALLBACK_APY_BY_SYMBOL[symbol]?.apyPct ??
    (category === "yield" ? 9.5 : 5.5)
  );
}

export function getFallbackNetworkLabel(symbol: string): string {
  return (
    FALLBACK_APY_BY_SYMBOL[symbol]?.label ??
    `${symbol} štandardný staking odhad`
  );
}

/** Build portfolio yield context from live portfolio assets. */
export function buildPortfolioYieldContext(input: {
  holdings: Array<{
    symbol: string;
    category: AssetCategory;
    usdValue: number;
    roiPercent: number;
    hasPurchaseHistory: boolean;
  }>;
}): PortfolioYieldContext {
  return {
    holdings: input.holdings
      .filter((h) => h.usdValue > 0)
      .map((h) => ({
        symbol: h.symbol.toUpperCase(),
        category: h.category,
        usdValue: h.usdValue,
        roiPercent: h.roiPercent,
        hasPurchaseHistory: h.hasPurchaseHistory,
      })),
  };
}

/**
 * Priority 1 — portfolio module: user holds yield/satellite token with purchase history.
 * Uses realized ROI as a staking-yield proxy when available.
 */
export function resolveYieldApyFromPortfolio(
  symbol: string,
  context?: PortfolioYieldContext | null,
): ResolvedYieldApy | null {
  if (!context?.holdings.length) return null;

  const holding = context.holdings.find(
    (h) => h.symbol === symbol.toUpperCase(),
  );
  if (!holding || holding.usdValue <= 0) return null;
  if (holding.category !== "yield" && holding.category !== "satellite") {
    return null;
  }

  if (holding.hasPurchaseHistory && Math.abs(holding.roiPercent) > 0.5) {
    const fallback = getFallbackApy(symbol, holding.category);
    const roiSignal = clamp(holding.roiPercent * 0.28, -5, 18);
    const impliedApy = clamp(fallback + roiSignal, 0.5, 45);

    return {
      symbol: symbol.toUpperCase(),
      apyPct: round1(impliedApy),
      source: "portfolio",
      isEstimated: false,
      sourceLabel: YIELD_APY_SOURCE_LABELS.portfolio,
      fetchedAt: new Date().toISOString(),
    };
  }

  return {
    symbol: symbol.toUpperCase(),
    apyPct: round1(getFallbackApy(symbol, holding.category)),
    source: "portfolio",
    isEstimated: true,
    sourceLabel: `${YIELD_APY_SOURCE_LABELS.portfolio} · držba`,
    fetchedAt: new Date().toISOString(),
  };
}

function adjustApyByTechnicals(input: {
  baseApy: number;
  category: AssetCategory;
  atr14dPct?: number | null;
  fundamentalScore?: number | null;
  convictionScore?: number | null;
}): number {
  const atr = input.atr14dPct ?? 4;
  const volBoost = lerpScore(atr, 2, 10, 0.92, 1.08);
  const fund = input.fundamentalScore ?? 55;
  const fundBoost = lerpScore(fund, 30, 80, 0.94, 1.06);
  const conviction = input.convictionScore ?? 50;
  const convictionBoost =
    input.category === "yield"
      ? lerpScore(conviction, 40, 90, 0.97, 1.05)
      : 1;

  return clamp(
    input.baseApy * volBoost * fundBoost * convictionBoost,
    0.5,
    45,
  );
}

/**
 * Resolve APR/APY with explicit source priority:
 * 1. Portfolio (live holdings + ROI)
 * 2. Live API (yield-metrics technical feed)
 * 3. DeFiLlama on-chain / protocol yields
 * 4. Portfolio estimated hold (yield bucket, no ROI)
 * 5. Safe local fallback (clearly labeled)
 */
export function resolveYieldApy(input: {
  symbol: string;
  category: AssetCategory;
  portfolio?: PortfolioYieldContext | null;
  apiApyPct?: number | null;
  defillamaApyPct?: number | null;
  atr14dPct?: number | null;
  fundamentalScore?: number | null;
  convictionScore?: number | null;
}): ResolvedYieldApy {
  const symbol = input.symbol.toUpperCase();
  const portfolioRecord = resolveYieldApyFromPortfolio(symbol, input.portfolio);

  if (portfolioRecord && !portfolioRecord.isEstimated) {
    return portfolioRecord;
  }

  if (input.apiApyPct != null && input.apiApyPct > 0) {
    return {
      symbol,
      apyPct: round1(
        adjustApyByTechnicals({
          baseApy: input.apiApyPct,
          category: input.category,
          atr14dPct: input.atr14dPct,
          fundamentalScore: input.fundamentalScore,
          convictionScore: input.convictionScore,
        }),
      ),
      source: "api",
      isEstimated: false,
      sourceLabel: YIELD_APY_SOURCE_LABELS.api,
      fetchedAt: new Date().toISOString(),
    };
  }

  if (input.defillamaApyPct === null) {
    return {
      symbol,
      apyPct: 0,
      source: "defillama",
      isEstimated: false,
      sourceLabel: YIELD_APY_SOURCE_LABELS.defillama,
      fetchedAt: new Date().toISOString(),
    };
  }

  if (input.defillamaApyPct != null && input.defillamaApyPct >= 0) {
    return {
      symbol,
      apyPct: round1(
        adjustApyByTechnicals({
          baseApy: input.defillamaApyPct,
          category: input.category,
          atr14dPct: input.atr14dPct,
          fundamentalScore: input.fundamentalScore,
          convictionScore: input.convictionScore,
        }),
      ),
      source: "defillama",
      isEstimated: false,
      sourceLabel: YIELD_APY_SOURCE_LABELS.defillama,
      fetchedAt: new Date().toISOString(),
    };
  }

  if (portfolioRecord) {
    return portfolioRecord;
  }

  const fallbackBase = getFallbackApy(symbol, input.category);
  const adjusted = adjustApyByTechnicals({
    baseApy: fallbackBase,
    category: input.category,
    atr14dPct: input.atr14dPct,
    fundamentalScore: input.fundamentalScore,
    convictionScore: input.convictionScore,
  });

  return {
    symbol,
    apyPct: round1(adjusted),
    source: "fallback",
    isEstimated: true,
    sourceLabel: `${YIELD_APY_SOURCE_LABELS.fallback} · ${getFallbackNetworkLabel(symbol)}`,
    fetchedAt: new Date().toISOString(),
  };
}

export type ResolvedYieldApyMap = Record<string, ResolvedYieldApy>;

export function buildResolvedYieldApyMap(input: {
  symbols: string[];
  categoriesBySymbol: Record<string, AssetCategory>;
  portfolio?: PortfolioYieldContext | null;
  apiApyBySymbol?: Record<string, number | null | undefined>;
  defillamaApyBySymbol?: Record<string, number | null | undefined>;
  technicalsBySymbol?: Record<
    string,
    {
      atr14dPct?: number | null;
      fundamentalScore?: number | null;
      convictionScore?: number | null;
    }
  >;
}): ResolvedYieldApyMap {
  const map: ResolvedYieldApyMap = {};

  for (const symbol of input.symbols) {
    const category = input.categoriesBySymbol[symbol] ?? "yield";
    const technicals = input.technicalsBySymbol?.[symbol];

    map[symbol] = resolveYieldApy({
      symbol,
      category,
      portfolio: input.portfolio,
      apiApyPct: input.apiApyBySymbol?.[symbol],
      defillamaApyPct: input.defillamaApyBySymbol?.[symbol],
      atr14dPct: technicals?.atr14dPct,
      fundamentalScore: technicals?.fundamentalScore,
      convictionScore: technicals?.convictionScore,
    });
  }

  return map;
}

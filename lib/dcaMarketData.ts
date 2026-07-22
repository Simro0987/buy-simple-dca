import type { AssetCategory } from "@/lib/portfolioStorage";
import { fetchMarketDataRace } from "@/lib/market-data/fetchMarketData";
import {
  fetchBinanceTechnicals,
  technicalsToMarketPayload,
} from "@/lib/binanceTechnicals";

export interface DcaTokenDefinition {
  symbol: string;
  name: string;
  coingeckoId: string;
  category: AssetCategory;
  logoUrl: string;
  weightPercent: number;
  binanceSymbol?: string;
}

export const DCA_CORE_TOKENS: DcaTokenDefinition[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    coingeckoId: "bitcoin",
    category: "core",
    logoUrl:
      "https://assets.coingecko.com/coins/images/1/small/bitcoin.png",
    weightPercent: 54,
    binanceSymbol: "BTCUSDT",
  },
];

export const DCA_SATELLITE_TOKENS: DcaTokenDefinition[] = [
  {
    symbol: "ETH",
    name: "Ethereum",
    coingeckoId: "ethereum",
    category: "satellite",
    logoUrl:
      "https://assets.coingecko.com/coins/images/279/small/ethereum.png",
    weightPercent: 25,
    binanceSymbol: "ETHUSDT",
  },
  {
    symbol: "SOL",
    name: "Solana",
    coingeckoId: "solana",
    category: "satellite",
    logoUrl:
      "https://assets.coingecko.com/coins/images/4128/small/solana.png",
    weightPercent: 10,
    binanceSymbol: "SOLUSDT",
  },
];

export interface YieldFilterTokenDefinition extends DcaTokenDefinition {
  chainTag: string;
}

export const DCA_YIELD_TOKENS: YieldFilterTokenDefinition[] = [
  {
    symbol: "HYPE",
    name: "Hyperliquid",
    coingeckoId: "hyperliquid",
    category: "yield",
    logoUrl:
      "https://assets.coingecko.com/coins/images/50882/small/hyperliquid.jpg",
    weightPercent: 2,
    binanceSymbol: "HYPEUSDT",
    chainTag: "ARB",
  },
  {
    symbol: "JUP",
    name: "Jupiter",
    coingeckoId: "jupiter-exchange-solana",
    category: "yield",
    logoUrl:
      "https://assets.coingecko.com/coins/images/34188/small/jup.png",
    weightPercent: 2,
    binanceSymbol: "JUPUSDT",
    chainTag: "SOL",
  },
  {
    symbol: "PENDLE",
    name: "Pendle",
    coingeckoId: "pendle",
    category: "yield",
    logoUrl:
      "https://assets.coingecko.com/coins/images/15069/small/Pendle_Logo_Normal-03.png",
    weightPercent: 2,
    binanceSymbol: "PENDLEUSDT",
    chainTag: "ETH",
  },
  {
    symbol: "GMX",
    name: "GMX",
    coingeckoId: "gmx",
    category: "yield",
    logoUrl:
      "https://assets.coingecko.com/coins/images/18323/small/arbit.png",
    weightPercent: 2,
    binanceSymbol: "GMXUSDT",
    chainTag: "ARB",
  },
  {
    symbol: "AAVE",
    name: "Aave",
    coingeckoId: "aave",
    category: "yield",
    logoUrl:
      "https://assets.coingecko.com/coins/images/12645/small/aave-token-round.png",
    weightPercent: 2,
    binanceSymbol: "AAVEUSDT",
    chainTag: "ETH",
  },
  {
    symbol: "MORPHO",
    name: "Morpho",
    coingeckoId: "morpho",
    category: "yield",
    logoUrl: "/icons/morpho.svg",
    weightPercent: 1,
    binanceSymbol: "MORPHOUSDT",
    chainTag: "ETH",
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    coingeckoId: "chainlink",
    category: "yield",
    logoUrl:
      "https://assets.coingecko.com/coins/images/877/small/chainlink-new-logo.png",
    weightPercent: 1,
    binanceSymbol: "LINKUSDT",
    chainTag: "ETH",
  },
];

export const ALL_DCA_TOKENS: DcaTokenDefinition[] = [
  ...DCA_CORE_TOKENS,
  ...DCA_SATELLITE_TOKENS,
  ...DCA_YIELD_TOKENS,
];

export interface FearGreedData {
  value: number;
  label: string;
  classification: string;
}

export interface MarketDataServicePayload {
  generatedAt: string;
  btc: {
    ma200w: number;
    ma200wStale: boolean;
    mayerMultiple: number;
    ma200d: number;
    ema50?: number;
    price: number;
    atr14d: number;
    rsi14?: number;
  };
  eth: { atr14d: number; rsi14: number | null };
  sol: { tvl: number; atr14d: number; rsi14: number | null };
  unlocks: Array<{ symbol: string; pct: number; date: string }>;
  degraded?: boolean;
  fallback?: boolean;
  source?: "binance" | "supabase";
}

export interface TokenMarketSnapshot {
  symbol: string;
  price: number;
  change24h: number;
  marketCap: number;
  image?: string;
  hasLiveData: boolean;
}

export interface DcaMarketSnapshot {
  fearGreed: FearGreedData;
  marketData: MarketDataServicePayload;
  tokens: Record<string, TokenMarketSnapshot>;
  fetchedAt: string;
  degraded: boolean;
}

const FEAR_GREED_FALLBACK: FearGreedData = {
  value: 50,
  label: "Neutral",
  classification: "Neutral",
};

const MARKET_DATA_FALLBACK: MarketDataServicePayload = {
  generatedAt: new Date().toISOString(),
  btc: {
    ma200w: 48500,
    ma200wStale: true,
    mayerMultiple: 1.15,
    ma200d: 0,
    price: 0,
    atr14d: 2.0,
  },
  eth: { atr14d: 2.8, rsi14: null },
  sol: { tvl: 11_500_000_000, atr14d: 4.2, rsi14: null },
  unlocks: [],
  degraded: true,
  fallback: true,
};

async function fetchFearGreed(): Promise<FearGreedData> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      cache: "no-store",
    });
    if (!res.ok) return FEAR_GREED_FALLBACK;
    const json = (await res.json()) as {
      data?: Array<{ value: string; value_classification: string }>;
    };
    const entry = json.data?.[0];
    if (!entry) return FEAR_GREED_FALLBACK;
    return {
      value: Number(entry.value) || 50,
      label: entry.value_classification,
      classification: entry.value_classification,
    };
  } catch {
    return FEAR_GREED_FALLBACK;
  }
}

async function fetchBinanceMarketData(): Promise<MarketDataServicePayload> {
  try {
    const bundle = await fetchBinanceTechnicals();
    if (bundle.btc.price > 0 && !bundle.btc.stale) {
      return technicalsToMarketPayload(bundle);
    }
    if (bundle.btc.price > 0) {
      return { ...technicalsToMarketPayload(bundle), degraded: false };
    }
    return { ...technicalsToMarketPayload(bundle), degraded: true, fallback: true };
  } catch {
    return MARKET_DATA_FALLBACK;
  }
}

async function fetchTokenMarketCaps(
  tokens: DcaTokenDefinition[],
): Promise<Record<string, TokenMarketSnapshot>> {
  const result: Record<string, TokenMarketSnapshot> = {};

  for (const token of tokens) {
    result[token.symbol] = {
      symbol: token.symbol,
      price: 0,
      change24h: 0,
      marketCap: 0,
      image: token.logoUrl,
      hasLiveData: false,
    };
  }

  if (tokens.length === 0) return result;

  try {
    const { prices } = await fetchMarketDataRace(
      tokens.map((t) => ({
        symbol: t.symbol,
        coingeckoId: t.coingeckoId,
        name: t.name,
      })),
    );

    for (const token of tokens) {
      const entry = prices[token.coingeckoId];
      if (!entry || entry.price <= 0) continue;
      result[token.symbol] = {
        symbol: token.symbol,
        price: entry.price,
        change24h: entry.change24h,
        marketCap: entry.marketCap,
        image: entry.image || token.logoUrl,
        hasLiveData: true,
      };
    }
  } catch {
    // Return partial result with hasLiveData=false
  }

  return result;
}

export function resolveActiveDcaTokens(
  portfolioSymbols?: string[],
): DcaTokenDefinition[] {
  if (!portfolioSymbols || portfolioSymbols.length === 0) {
    return ALL_DCA_TOKENS;
  }

  const portfolioSet = new Set(portfolioSymbols.map((s) => s.toUpperCase()));
  const matched = ALL_DCA_TOKENS.filter((t) => portfolioSet.has(t.symbol));

  if (matched.length === 0) {
    return ALL_DCA_TOKENS;
  }

  const totalWeight = matched.reduce((sum, t) => sum + t.weightPercent, 0);
  return matched.map((t) => ({
    ...t,
    weightPercent:
      totalWeight > 0
        ? Math.round((t.weightPercent / totalWeight) * 1000) / 10
        : t.weightPercent,
  }));
}

export async function fetchDcaMarketSnapshot(
  portfolioSymbols?: string[],
): Promise<DcaMarketSnapshot> {
  const activeTokens = resolveActiveDcaTokens(portfolioSymbols);

  const [fearGreed, marketData, tokens] = await Promise.all([
    fetchFearGreed(),
    fetchBinanceMarketData(),
    fetchTokenMarketCaps(activeTokens),
  ]);

  if (marketData.btc.price > 0) {
    if (tokens.BTC) {
      tokens.BTC.price = marketData.btc.price;
      tokens.BTC.hasLiveData = true;
    }
  }

  const degraded = marketData.btc.price <= 0;

  return {
    fearGreed,
    marketData,
    tokens,
    fetchedAt: new Date().toISOString(),
    degraded,
  };
}

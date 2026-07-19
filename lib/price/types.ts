export type PriceSource = "coingecko" | "mobula" | "coinmarketcap";

export interface NormalizedTokenPrice {
  symbol: string;
  coingeckoId: string;
  name?: string;
  price: number;
  change24h: number;
  change7d: number;
  marketCap: number;
  image?: string;
  source: PriceSource;
  fetchedAt: string;
}

export type NormalizedPricesMap = Record<string, NormalizedTokenPrice>;

export interface PriceFetchResult {
  prices: NormalizedPricesMap;
  source: PriceSource;
  degraded: boolean;
  cached: boolean;
  fetchedAt: string;
}

export interface ApiSourceHealth {
  source: PriceSource | "aggregated" | "unknown";
  healthy: boolean;
  degraded: boolean;
  message: string | null;
  lastCheck: string | null;
}

export interface ApiStatusState {
  prices: ApiSourceHealth;
  news: ApiSourceHealth;
  dca: ApiSourceHealth;
}

export const DEFAULT_API_STATUS: ApiStatusState = {
  prices: {
    source: "unknown",
    healthy: true,
    degraded: false,
    message: null,
    lastCheck: null,
  },
  news: {
    source: "aggregated",
    healthy: true,
    degraded: false,
    message: null,
    lastCheck: null,
  },
  dca: {
    source: "aggregated",
    healthy: true,
    degraded: false,
    message: null,
    lastCheck: null,
  },
};

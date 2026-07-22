import {
  fetchMarketDataRace,
  toLegacyCryptoPrices,
  type MarketTokenInput,
} from "@/lib/market-data/fetchMarketData";
import type { PriceFetchResult } from "@/lib/price/types";

export type { MarketTokenInput as PriceTokenInput } from "@/lib/market-data/fetchMarketData";

export async function fetchPricesMultiSource(
  tokens: MarketTokenInput[],
): Promise<PriceFetchResult> {
  const result = await fetchMarketDataRace(tokens);
  return {
    prices: result.prices,
    source: result.source,
    degraded: result.degraded,
    cached: false,
    fetchedAt: result.fetchedAt,
  };
}

export { toLegacyCryptoPrices };

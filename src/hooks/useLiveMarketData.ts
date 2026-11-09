/**
 * useLiveMarketData — LIVE spot prices for BTC / ETH / SOL from the public
 * CoinGecko API (routed through the edge proxy to dodge CORS + rate limits).
 * No hardcoded mock prices: consumers must render `undefined` as a loading state.
 */
import { useQuery } from '@tanstack/react-query';
import { fetchLivePrices } from '@/lib/liveMarketPrices';
export type { LivePrices } from '@/lib/liveMarketPrices';

export function useLiveMarketData() {
  return useQuery({
    queryKey: ['live-market-data-v1'],
    queryFn: fetchLivePrices,
    refetchInterval: 30_000,
    staleTime: 30_000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (a) => Math.min(2000 * 2 ** a, 15_000),
  });
}

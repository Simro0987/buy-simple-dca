import { fetchCentralHub } from '@/lib/centralApiHub';
import { useQuery } from '@tanstack/react-query';

export type FeedStatus = 'live' | 'fallback' | 'down';
export interface BtcIndicators {
  fetchedAt: number;
  price: { value: number | null; ath: number | null; change24h: number | null; source: string | null; athSource?: string | null; changeSource?: string | null; status: FeedStatus };
  pools?: { count: number; bestApy: number | null } | null;
  mobula?: { symbol: string; price: number }[];
  candles: { count: number; source: string | null; status: FeedStatus };
  rsi14: number | null; sma200: number | null; mayer: number | null; vol30: number | null;
  mvrv: { value: number | null; z: number | null; source: string | null; status: FeedStatus };
  fearGreed: { value: number | null; source: string | null; status: FeedStatus };
}

/** Server-side BTC multi-API waterfall (3500 ms per source). */
export function useBtcIndicators() {
  return useQuery({
    queryKey: ['btc-indicators'],
    queryFn: (): Promise<BtcIndicators> => fetchCentralHub(),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

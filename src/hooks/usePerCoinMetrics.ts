import { useQuery } from '@tanstack/react-query';
import type { CoinKey, CoinMetrics } from '@/lib/dynamicExecution';

const COIN_IDS: Record<CoinKey, string> = {
  btc: 'bitcoin',
  eth: 'ethereum',
  sol: 'solana',
};

interface MarketChartResponse {
  prices: Array<[number, number]>;
}

function calcVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const returns: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const r = (prices[i] - prices[i - 1]) / prices[i - 1];
    returns.push(r);
  }
  const mean = returns.reduce((s, v) => s + v, 0) / returns.length;
  const variance = returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * 100; // percent
}

function calcMomentum(prices: number[]): number {
  if (prices.length < 2) return 0;
  const first = prices[0];
  const last = prices[prices.length - 1];
  if (first === 0) return 0;
  return ((last - first) / first) * 100;
}

async function fetchCoinMetrics(coin: CoinKey): Promise<CoinMetrics> {
  const id = COIN_IDS[coin];
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=30&interval=daily`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`CoinGecko ${res.status}`);
  const data: MarketChartResponse = await res.json();
  const prices = (data.prices ?? []).map(p => p[1]);
  return {
    volatility30d: calcVolatility(prices),
    momentum30d: calcMomentum(prices),
  };
}

export function usePerCoinMetrics() {
  return useQuery({
    queryKey: ['per-coin-metrics-30d'],
    queryFn: async (): Promise<Record<CoinKey, CoinMetrics>> => {
      const coins: CoinKey[] = ['btc', 'eth', 'sol'];
      // Sequential to be friendly to CoinGecko rate limits
      const out: Partial<Record<CoinKey, CoinMetrics>> = {};
      for (const c of coins) {
        try {
          out[c] = await fetchCoinMetrics(c);
        } catch {
          out[c] = { volatility30d: 0, momentum30d: 0 };
        }
      }
      return out as Record<CoinKey, CoinMetrics>;
    },
    staleTime: 60 * 60 * 1000, // 60 min
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

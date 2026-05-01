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

// Window optimized for WEEKLY DCA (Monday buys):
// 14 days = ~2 weeks → captures recent swings without 30D lag,
// while still smoother than 7D (which is too noisy for a single weekly decision).
const WINDOW_DAYS = 14;

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
  const url = `https://api.coingecko.com/api/v3/coins/${id}/market_chart?vs_currency=usd&days=${WINDOW_DAYS}&interval=daily`;
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
    queryKey: ['per-coin-metrics-14d'],
    queryFn: async (): Promise<Record<CoinKey, CoinMetrics>> => {
      const coins: CoinKey[] = ['btc', 'eth', 'sol'];
      // Sequential to be friendly to CoinGecko rate limits
      const out: Partial<Record<CoinKey, CoinMetrics>> = {};
      // Historické priemery 14D dennej volatility (fallback ak CoinGecko zlyhá) —
      // zachovávajú diferenciáciu medzi tokenmi namiesto núl.
      const FALLBACK: Record<CoinKey, CoinMetrics> = {
        btc: { volatility30d: 2.0, momentum30d: 0 },
        eth: { volatility30d: 2.8, momentum30d: 0 },
        sol: { volatility30d: 4.0, momentum30d: 0 },
      };
      for (const c of coins) {
        try {
          const m = await fetchCoinMetrics(c);
          // Ak API vráti zjavne nevalidné dáta (vol=0), použij fallback
          out[c] = m.volatility30d > 0 ? m : FALLBACK[c];
        } catch {
          out[c] = FALLBACK[c];
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

import { wilderRsi } from '@/lib/rsi';
import { useQuery } from '@tanstack/react-query';
import { YIELD_TOKENS, type YieldToken } from '@/lib/yieldTokens';

export interface YieldMetric {
  price: number;
  volatility14d: number;  // % daily stdev
  momentum14d: number;    // % change over 14d
  rsi14: number;          // 0..100
  sma14: number;          // 14D simple moving average
  priceVsSmaPct: number;  // (price / sma14 - 1) * 100
}

export type YieldMetricsMap = Record<string, YieldMetric>;

function calcVolPct(prices: number[]): number {
  if (prices.length < 2) return 0;
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    const a = prices[i - 1], b = prices[i];
    if (a > 0 && b > 0) r.push((b - a) / a);
  }
  if (!r.length) return 0;
  const m = r.reduce((s, v) => s + v, 0) / r.length;
  const v = r.reduce((s, x) => s + (x - m) ** 2, 0) / r.length;
  return Math.sqrt(v) * 100;
}

function calcMomPct(prices: number[]): number {
  if (prices.length < 2 || !prices[0]) return 0;
  return ((prices[prices.length - 1] - prices[0]) / prices[0]) * 100;
}

function calcRSI(prices: number[], period = 14): number {
  return wilderRsi(prices, period);
}

function calcSMA(prices: number[]): number {
  if (!prices.length) return 0;
  return prices.reduce((s, v) => s + v, 0) / prices.length;
}

const FALLBACK: YieldMetric = { price: 0, volatility14d: 4, momentum14d: 0, rsi14: 50, sma14: 0, priceVsSmaPct: 0 };

async function fetchOne(t: YieldToken): Promise<YieldMetric> {
  const { cgFetch } = await import('@/lib/coingecko');
  const res = await cgFetch(`/coins/${t.coingeckoId}/market_chart`, {
    vs_currency: 'usd', days: 14, interval: 'daily',
  });
  if (!res.ok) throw new Error(`cg ${res.status}`);
  const data = await res.json() as { prices?: Array<[number, number]> };
  const prices = (data.prices ?? []).map(p => p[1]).filter(n => Number.isFinite(n) && n > 0);
  if (prices.length < 3) return FALLBACK;
  const price = prices[prices.length - 1];
  const sma14 = calcSMA(prices);
  return {
    price,
    volatility14d: calcVolPct(prices),
    momentum14d: calcMomPct(prices),
    rsi14: calcRSI(prices, 14),
    sma14,
    priceVsSmaPct: sma14 > 0 ? ((price - sma14) / sma14) * 100 : 0,
  };
}

export function useYieldTokenMetrics() {
  return useQuery({
    queryKey: ['yield-token-metrics-14d'],
    queryFn: async (): Promise<YieldMetricsMap> => {
      const out: YieldMetricsMap = {};
      for (const t of YIELD_TOKENS) {
        try { out[t.id] = await fetchOne(t); }
        catch { out[t.id] = FALLBACK; }
      }
      return out;
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

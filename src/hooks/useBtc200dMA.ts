import { useQuery } from '@tanstack/react-query';

export interface Btc200dMAData {
  currentPrice: number;
  ma200: number;
  distancePct: number;   // (price - ma) / ma * 100
  above: boolean;
  candleCount: number;
}

// Fetch ~210 daily BTC closes from CoinGecko and compute the 200D MA.
async function fetchBtc200dMA(): Promise<Btc200dMAData> {
  // CoinGecko free endpoint: market_chart with days=210 returns daily candles.
  const url = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=210&interval=daily';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const json = await res.json() as { prices: [number, number][] };
  const closes = (json.prices ?? []).map(p => p[1]).filter(n => Number.isFinite(n));
  if (closes.length < 50) throw new Error('insufficient candles');

  const last200 = closes.slice(-200);
  const ma200 = last200.reduce((s, v) => s + v, 0) / last200.length;
  const currentPrice = closes[closes.length - 1];
  const distancePct = ((currentPrice - ma200) / ma200) * 100;
  return {
    currentPrice,
    ma200,
    distancePct,
    above: currentPrice > ma200,
    candleCount: closes.length,
  };
}

export function useBtc200dMA() {
  return useQuery({
    queryKey: ['btc-200d-ma'],
    queryFn: fetchBtc200dMA,
    refetchInterval: 60 * 60 * 1000, // hourly is plenty for a 200D MA
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

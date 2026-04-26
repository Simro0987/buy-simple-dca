import { useQuery } from '@tanstack/react-query';

export interface Btc200dMAData {
  currentPrice: number;
  ma200: number;
  ma50: number;
  distancePct: number;       // (price - ma200) / ma200 * 100
  above: boolean;             // price > ma200
  ma50AboveMa200: boolean;    // golden/death cross state
  candleCount: number;
  change7dPct: number;        // 7-day BTC % change
  change30dPct: number;       // 30-day BTC % change (momentum)
  high30d: number;            // BTC 30D high
  distanceFrom30dHighPct: number; // negative when below high
  volatility30dPct: number;   // stdev of daily returns over 30D, in %
}

// Fetch ~210 daily BTC closes from CoinGecko and compute the 200D MA, 50D MA,
// 30D high, 30D momentum, 30D realized volatility, and 7D change.
async function fetchBtc200dMA(): Promise<Btc200dMAData> {
  const url = 'https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=210&interval=daily';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const json = await res.json() as { prices: [number, number][] };
  const closes = (json.prices ?? []).map(p => p[1]).filter(n => Number.isFinite(n));
  if (closes.length < 50) throw new Error('insufficient candles');

  const last200 = closes.slice(-200);
  const last50 = closes.slice(-50);
  const last30 = closes.slice(-30);
  const ma200 = last200.reduce((s, v) => s + v, 0) / last200.length;
  const ma50 = last50.reduce((s, v) => s + v, 0) / last50.length;
  const currentPrice = closes[closes.length - 1];
  const distancePct = ((currentPrice - ma200) / ma200) * 100;
  const sevenAgo = closes[Math.max(0, closes.length - 8)] ?? currentPrice;
  const change7dPct = sevenAgo > 0 ? ((currentPrice - sevenAgo) / sevenAgo) * 100 : 0;
  const thirtyAgo = closes[Math.max(0, closes.length - 31)] ?? currentPrice;
  const change30dPct = thirtyAgo > 0 ? ((currentPrice - thirtyAgo) / thirtyAgo) * 100 : 0;
  const high30d = last30.reduce((m, v) => Math.max(m, v), 0);
  const distanceFrom30dHighPct = high30d > 0 ? ((currentPrice - high30d) / high30d) * 100 : 0;

  // 30D realized volatility from daily log-ish returns (simple % returns are fine here)
  const returns: number[] = [];
  for (let i = closes.length - 30; i < closes.length; i++) {
    if (i <= 0) continue;
    const a = closes[i - 1];
    const b = closes[i];
    if (a > 0) returns.push((b - a) / a);
  }
  const mean = returns.length ? returns.reduce((s, v) => s + v, 0) / returns.length : 0;
  const variance = returns.length
    ? returns.reduce((s, v) => s + (v - mean) ** 2, 0) / returns.length
    : 0;
  const volatility30dPct = Math.sqrt(variance) * 100;

  return {
    currentPrice,
    ma200,
    ma50,
    distancePct,
    above: currentPrice > ma200,
    ma50AboveMa200: ma50 > ma200,
    candleCount: closes.length,
    change7dPct,
    change30dPct,
    high30d,
    distanceFrom30dHighPct,
    volatility30dPct,
  };
}

export function useBtc200dMA() {
  return useQuery({
    queryKey: ['btc-200d-ma'],
    queryFn: fetchBtc200dMA,
    refetchInterval: 60 * 60 * 1000,
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

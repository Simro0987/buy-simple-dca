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
  source: 'coingecko' | 'binance';
}

const CACHE_KEY = 'btc-200d-ma-cache-v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6h

interface CachedData { ts: number; data: Btc200dMAData }

function readCache(): CachedData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const c = JSON.parse(raw) as CachedData;
    if (Date.now() - c.ts > CACHE_TTL_MS) return null;
    return c;
  } catch { return null; }
}
function writeCache(data: Btc200dMAData) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data })); } catch { /* noop */ }
}

function computeMetrics(closes: number[], source: 'coingecko' | 'binance'): Btc200dMAData {
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
    currentPrice, ma200, ma50, distancePct,
    above: currentPrice > ma200,
    ma50AboveMa200: ma50 > ma200,
    candleCount: closes.length,
    change7dPct, change30dPct, high30d, distanceFrom30dHighPct, volatility30dPct,
    source,
  };
}

async function fetchFromCoinGecko(): Promise<number[]> {
  // Bez `interval=daily` (vyžaduje pro tier od Mar 2024). days=365 vracia 1h candles, ktoré agregujeme na denné closes.
  const { cgFetch } = await import('@/lib/coingecko');
  const res = await cgFetch('/coins/bitcoin/market_chart', { vs_currency: 'usd', days: 365 });
  if (!res.ok) throw new Error(`coingecko ${res.status}`);
  const json = await res.json() as { prices: [number, number][] };
  const prices = json.prices ?? [];
  if (prices.length === 0) throw new Error('coingecko empty');
  // Bucketize per day (UTC)
  const buckets = new Map<string, number>();
  for (const [ts, p] of prices) {
    const d = new Date(ts).toISOString().slice(0, 10);
    buckets.set(d, p); // posledný v dni
  }
  return Array.from(buckets.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([, p]) => p);
}

async function fetchFromBinance(): Promise<number[]> {
  // Binance vracia 1d klines bez API key. limit 250 → ~250 dní.
  const url = 'https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=250';
  const res = await fetch(url);
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const arr = await res.json() as Array<[number, string, string, string, string, string, ...unknown[]]>;
  if (!Array.isArray(arr) || arr.length === 0) throw new Error('binance empty');
  // [openTime, open, high, low, close, ...]
  return arr.map(k => Number(k[4])).filter(n => Number.isFinite(n));
}

async function fetchBtc200dMA(): Promise<Btc200dMAData> {
  // 1) Skús CoinGecko
  try {
    const closes = await fetchFromCoinGecko();
    const result = computeMetrics(closes, 'coingecko');
    writeCache(result);
    return result;
  } catch (e) {
    console.warn('CoinGecko 200D MA fallback to Binance:', e);
  }
  // 2) Fallback Binance
  try {
    const closes = await fetchFromBinance();
    const result = computeMetrics(closes, 'binance');
    writeCache(result);
    return result;
  } catch (e) {
    console.warn('Binance 200D MA failed:', e);
  }
  // 3) Cache (aj expired) ako posledná záchrana
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw) as CachedData;
      if (c?.data) return c.data;
    }
  } catch { /* noop */ }
  throw new Error('all sources failed');
}

export function useBtc200dMA() {
  return useQuery({
    queryKey: ['btc-200d-ma'],
    queryFn: fetchBtc200dMA,
    initialData: () => readCache()?.data,
    refetchInterval: 60 * 60 * 1000,
    staleTime: 30 * 60 * 1000,
    retry: 2,
    retryDelay: attempt => Math.min(2000 * 2 ** attempt, 15000),
  });
}

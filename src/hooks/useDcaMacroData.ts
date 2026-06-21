import { useQuery } from '@tanstack/react-query';
import type { CoinKey } from '@/lib/dynamicExecution';

const CACHE_KEY = 'dca-macro-live-v1';
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 min

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  ...unknown[],
];

export interface DcaMacroCoinData {
  close: number;
  rsi14: number;
  ema50: number;
  atr7: number;
  atr7Pct: number;
  distanceFromEma50Pct: number;
  momentum7dPct: number;
}

export interface DcaMacroData {
  fearGreed: { value: number; classification: string };
  coins: Record<CoinKey, DcaMacroCoinData>;
  cachedAt: number;
  degraded?: boolean;
}

function readCache(): DcaMacroData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as DcaMacroData;
  } catch {
    return null;
  }
}

function writeCache(data: DcaMacroData): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  } catch {
    // ignore storage quota issues
  }
}

function isFresh(ts: number): boolean {
  return Date.now() - ts < CACHE_TTL_MS;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function calcRsi14(closes: number[]): number {
  const period = 14;
  if (closes.length < period + 1) return 50;
  const sample = closes.slice(-(period + 1));
  let gains = 0;
  let losses = 0;
  for (let i = 1; i < sample.length; i++) {
    const d = sample[i] - sample[i - 1];
    if (d > 0) gains += d;
    else losses -= d;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 99;
  const rs = avgGain / avgLoss;
  return Math.round(clamp(100 - 100 / (1 + rs), 0, 100));
}

function calcEma(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const k = 2 / (period + 1);
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = values[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcAtr7(highs: number[], lows: number[], closes: number[]): number {
  const period = 7;
  if (highs.length < period + 1 || lows.length < period + 1 || closes.length < period + 1) return 0;
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const high = highs[i];
    const low = lows[i];
    const prevClose = closes[i - 1];
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose),
    );
    trs.push(tr);
  }
  const sample = trs.slice(-period);
  return sample.reduce((s, v) => s + v, 0) / sample.length;
}

async function fetchFearGreed(): Promise<{ value: number; classification: string }> {
  const res = await fetch('https://api.alternative.me/fng/?limit=1');
  if (!res.ok) throw new Error(`Fear&Greed API ${res.status}`);
  const data = await res.json();
  return {
    value: Number.parseInt(data?.data?.[0]?.value ?? '50', 10) || 50,
    classification: data?.data?.[0]?.value_classification ?? 'Neutral',
  };
}

async function fetchKlines(symbol: 'BTCUSDT' | 'ETHUSDT' | 'SOLUSDT'): Promise<BinanceKline[]> {
  const res = await fetch(`https://api.binance.com/api/v3/klines?symbol=${symbol}&interval=1d&limit=50`);
  if (!res.ok) throw new Error(`Binance ${symbol} ${res.status}`);
  return await res.json() as BinanceKline[];
}

function buildCoinData(klines: BinanceKline[]): DcaMacroCoinData {
  const highs = klines.map((k) => Number.parseFloat(k[2]));
  const lows = klines.map((k) => Number.parseFloat(k[3]));
  const closes = klines.map((k) => Number.parseFloat(k[4]));
  const close = closes[closes.length - 1] ?? 0;
  const ema50 = calcEma(closes, 50);
  const atr7 = calcAtr7(highs, lows, closes);
  const atr7Pct = close > 0 ? (atr7 / close) * 100 : 0;
  const distanceFromEma50Pct = ema50 > 0 ? ((close - ema50) / ema50) * 100 : 0;
  const close7dAgo = closes[Math.max(0, closes.length - 8)] ?? close;
  const momentum7dPct = close7dAgo > 0 ? ((close - close7dAgo) / close7dAgo) * 100 : 0;

  return {
    close,
    rsi14: calcRsi14(closes),
    ema50,
    atr7,
    atr7Pct,
    distanceFromEma50Pct,
    momentum7dPct,
  };
}

const FALLBACK: DcaMacroData = {
  fearGreed: { value: 50, classification: 'Neutral' },
  coins: {
    btc: { close: 0, rsi14: 50, ema50: 0, atr7: 0, atr7Pct: 2.0, distanceFromEma50Pct: 0, momentum7dPct: 0 },
    eth: { close: 0, rsi14: 50, ema50: 0, atr7: 0, atr7Pct: 3.2, distanceFromEma50Pct: 0, momentum7dPct: 0 },
    sol: { close: 0, rsi14: 50, ema50: 0, atr7: 0, atr7Pct: 4.8, distanceFromEma50Pct: 0, momentum7dPct: 0 },
  },
  cachedAt: 0,
  degraded: true,
};

async function fetchMacroData(): Promise<DcaMacroData> {
  const cached = readCache();
  if (cached && isFresh(cached.cachedAt)) return cached;

  try {
    const [fearGreed, btcRows, ethRows, solRows] = await Promise.all([
      fetchFearGreed(),
      fetchKlines('BTCUSDT'),
      fetchKlines('ETHUSDT'),
      fetchKlines('SOLUSDT'),
    ]);

    const payload: DcaMacroData = {
      fearGreed,
      coins: {
        btc: buildCoinData(btcRows),
        eth: buildCoinData(ethRows),
        sol: buildCoinData(solRows),
      },
      cachedAt: Date.now(),
    };
    writeCache(payload);
    return payload;
  } catch {
    if (cached) return { ...cached, degraded: true };
    return { ...FALLBACK, cachedAt: Date.now() };
  }
}

export function useDcaMacroData() {
  return useQuery({
    queryKey: ['dca-macro-live'],
    queryFn: fetchMacroData,
    initialData: () => readCache() ?? undefined,
    staleTime: CACHE_TTL_MS,
    refetchInterval: CACHE_TTL_MS,
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

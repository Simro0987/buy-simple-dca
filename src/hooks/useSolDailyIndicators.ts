import { useQuery } from '@tanstack/react-query';

export interface SolDailyIndicators {
  price: number;
  sma200: number;
  ema50: number;
  rsi14: number;
  atr14: number;
  smaDistPct: number;
  support7d: number;
  pivotS1: number;
  pivotR1: number;
  candleCount: number;
}

function sma(values: number[], period: number): number {
  const slice = values.slice(-period);
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

function ema(values: number[], period: number): number {
  const slice = values.slice(-period);
  if (slice.length === 0) return 0;
  const k = 2 / (period + 1);
  let e = slice[0];
  for (let i = 1; i < slice.length; i++) e = slice[i] * k + e * (1 - k);
  return e;
}

/** Wilder-smoothed RSI over `period` daily candles. */
function rsi(values: number[], period = 14): number {
  if (values.length < period + 1) return 50;
  let gain = 0;
  let loss = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff; else loss -= diff;
  }
  const avgGain = gain / period;
  const avgLoss = loss / period;
  if (avgLoss === 0) return avgGain === 0 ? 50 : 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

/** ATR(14) — mean True Range over the last 14 candles. */
function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
  const trs: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1]),
    ));
  }
  const slice = trs.slice(-period);
  if (slice.length === 0) return 0;
  return slice.reduce((s, v) => s + v, 0) / slice.length;
}

async function fetchSolDailyIndicators(): Promise<SolDailyIndicators> {
  const res = await fetch('https://api.binance.com/api/v3/klines?symbol=SOLUSDT&interval=1d&limit=200');
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const raw = await res.json() as Array<[number, string, string, string, string, ...unknown[]]>;
  const highs = raw.map(k => Number(k[2]));
  const lows = raw.map(k => Number(k[3]));
  const closes = raw.map(k => Number(k[4]));
  if (closes.filter(n => Number.isFinite(n) && n > 0).length < 60) throw new Error('insufficient candles');

  const price = closes[closes.length - 1];
  const s200 = sma(closes, 200);
  const last = closes.length - 1;
  const p = (highs[last] + lows[last] + closes[last]) / 3;
  return {
    price,
    sma200: s200,
    ema50: ema(closes, 50),
    rsi14: rsi(closes, 14),
    atr14: atr(highs, lows, closes, 14),
    smaDistPct: s200 > 0 ? ((price - s200) / s200) * 100 : 0,
    support7d: Math.min(...lows.slice(-7)),
    pivotS1: 2 * p - highs[last],
    pivotR1: 2 * p - lows[last],
    candleCount: closes.length,
  };
}

export function useSolDailyIndicators() {
  return useQuery({
    queryKey: ['sol-daily-indicators'],
    queryFn: fetchSolDailyIndicators,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
    retry: 2,
    retryDelay: attempt => Math.min(2000 * 2 ** attempt, 15000),
  });
}

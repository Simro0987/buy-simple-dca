import { useQuery } from '@tanstack/react-query';

export interface BtcDailyIndicators {
  price: number;
  sma200: number;
  ema50: number;
  rsi14: number;
  smaDistPct: number;
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
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

async function fetchBtcDailyIndicators(): Promise<BtcDailyIndicators> {
  const res = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1d&limit=200');
  if (!res.ok) throw new Error(`binance ${res.status}`);
  const raw = await res.json() as Array<[number, string, string, string, string, ...unknown[]]>;
  const closes = raw.map(k => Number(k[4])).filter(n => Number.isFinite(n) && n > 0);
  if (closes.length < 60) throw new Error('insufficient candles');

  const price = closes[closes.length - 1];
  const s200 = sma(closes, 200);
  const e50 = ema(closes, 50);
  return {
    price,
    sma200: s200,
    ema50: e50,
    rsi14: rsi(closes, 14),
    smaDistPct: s200 > 0 ? ((price - s200) / s200) * 100 : 0,
    candleCount: closes.length,
  };
}

export function useBtcDailyIndicators() {
  return useQuery({
    queryKey: ['btc-daily-indicators'],
    queryFn: fetchBtcDailyIndicators,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 2 * 60 * 1000,
    retry: 2,
    retryDelay: attempt => Math.min(2000 * 2 ** attempt, 15000),
  });
}

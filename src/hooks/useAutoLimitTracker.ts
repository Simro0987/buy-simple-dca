/**
 * useAutoLimitTracker (merged indicator layer)
 *
 * Provides ATR(7d)-based dynamic discount recommendations for BTC/ETH/SOL.
 * Integrated into DynamicExecutionCard — order management is handled by Supabase.
 *
 * Data: Binance daily klines · 4h localStorage cache · graceful fallback
 */
import { useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';

export type LimitSymbol = 'BTC' | 'ETH' | 'SOL';

export interface TokenIndicator {
  atr7:         number;
  ema50:        number;
  discountPct:  number;
  currentPrice: number;
}

export type IndicatorMap = Record<LimitSymbol, TokenIndicator>;

const CACHE_PREFIX = 'alt-kline-cache-v1-';
const CACHE_TTL    = 4 * 60 * 60 * 1000;

const VMULT: Record<LimitSymbol, { mult: number; min: number; max: number }> = {
  BTC: { mult: 1.00, min: 2.0, max: 4.0 },
  ETH: { mult: 1.60, min: 3.0, max: 6.5 },
  SOL: { mult: 2.15, min: 4.5, max: 9.5 },
};

const FALLBACK_DISCOUNT: Record<LimitSymbol, number> = {
  BTC: 2.5, ETH: 4.0, SOL: 5.5,
};

const BINANCE_SYM: Record<LimitSymbol, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT',
};

function calcATR7(highs: number[], lows: number[], closes: number[]): number {
  const n = closes.length;
  if (n < 8) return 0;
  let sum = 0;
  for (let i = n - 7; i < n; i++) {
    const p = closes[i - 1];
    sum += Math.max(highs[i] - lows[i], Math.abs(highs[i] - p), Math.abs(lows[i] - p));
  }
  return sum / 7;
}

function calcEMA50(closes: number[]): number {
  const p = 50;
  if (closes.length < p) return closes[closes.length - 1] ?? 0;
  const k = 2 / (p + 1);
  let ema = closes[closes.length - p];
  for (let i = closes.length - p + 1; i < closes.length; i++) {
    ema = closes[i] * k + ema * (1 - k);
  }
  return ema;
}

function discountFromATR(sym: LimitSymbol, atr7: number, price: number): number {
  if (price <= 0 || atr7 <= 0) return FALLBACK_DISCOUNT[sym];
  const { mult, min, max } = VMULT[sym];
  const raw = (atr7 / price) * 100 * mult;
  return Math.round(Math.max(min, Math.min(max, raw)) * 10) / 10;
}

async function fetchKlines(sym: LimitSymbol) {
  const ck = CACHE_PREFIX + sym;
  try {
    const c = localStorage.getItem(ck);
    if (c) {
      const { ts, data } = JSON.parse(c);
      if (Date.now() - ts < CACHE_TTL) return data as { highs: number[]; lows: number[]; closes: number[] };
    }
  } catch { /* cache miss */ }
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const res  = await fetch(`https://api.binance.com/api/v3/klines?symbol=${BINANCE_SYM[sym]}&interval=1d&limit=55`, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Binance ${sym} ${res.status}`);
    const rows = await res.json() as [number,string,string,string,string,...unknown[]][];
    const data = {
      highs:  rows.map(k => parseFloat(k[2] as string)),
      lows:   rows.map(k => parseFloat(k[3] as string)),
      closes: rows.map(k => parseFloat(k[4] as string)),
    };
    try { localStorage.setItem(ck, JSON.stringify({ ts: Date.now(), data })); } catch { /* quota */ }
    return data;
  } finally { clearTimeout(timer); }
}

async function fetchAllIndicators(): Promise<IndicatorMap> {
  const [btc, eth, sol] = await Promise.allSettled(
    (['BTC', 'ETH', 'SOL'] as LimitSymbol[]).map(s => fetchKlines(s))
  );
  const map = {} as IndicatorMap;
  (['BTC', 'ETH', 'SOL'] as LimitSymbol[]).forEach((sym, i) => {
    const r = [btc, eth, sol][i];
    if (r.status === 'fulfilled') {
      const { highs, lows, closes } = r.value;
      const price = closes[closes.length - 1] ?? 0;
      const atr7  = calcATR7(highs, lows, closes);
      map[sym] = { atr7, ema50: calcEMA50(closes), discountPct: discountFromATR(sym, atr7, price), currentPrice: price };
    } else {
      map[sym] = { atr7: 0, ema50: 0, discountPct: FALLBACK_DISCOUNT[sym], currentPrice: 0 };
    }
  });
  return map;
}

export function useAutoLimitTracker() {
  const { data: indicators, isLoading: indicatorsLoading } = useQuery({
    queryKey:        ['auto-limit-indicators'],
    queryFn:         fetchAllIndicators,
    staleTime:       CACHE_TTL,
    refetchInterval: CACHE_TTL,
    retry: 2,
    retryDelay: 4000,
  });

  const getDiscount = useCallback((sym: LimitSymbol, livePrice: number): number => {
    const ind = indicators?.[sym];
    if (ind && ind.currentPrice > 0) return ind.discountPct;
    // fallback: compute from ATR=0 → returns FALLBACK_DISCOUNT
    return discountFromATR(sym, 0, livePrice);
  }, [indicators]);

  return { indicators, indicatorsLoading, getDiscount };
}

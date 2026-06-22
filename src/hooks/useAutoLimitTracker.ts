/**
 * useAutoLimitTracker
 *
 * ATR-based dynamic limit orders with:
 *  • Volatility-adjusted discounts: BTC 1×, ETH 1.6×, SOL 2.15×
 *  • 4-hour localStorage cache for Binance kline data
 *  • 7-day strict price lock — no API recalculation while locked
 *  • Auto-tracking via usePrices (30 s tick): marks filled when price ≤ target
 *  • Auto portfolio write on fill (adds token qty to smart-alloc-holdings)
 *  • Graceful error handling — falls back to fixed discounts, never crashes
 */
import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usePrices } from '@/hooks/usePrices';

// ─── Types ────────────────────────────────────────────────────────────────────

export type LimitSymbol = 'BTC' | 'ETH' | 'SOL';

export interface LockedOrder {
  symbol:       LimitSymbol;
  discountPct:  number;   // % below market at lock time
  targetPrice:  number;   // frozen target $ price
  volumeUsd:    number;   // allocated USD
  volumeToken:  number;   // = volumeUsd / targetPrice
  lockedAt:     number;   // ms timestamp
  expiresAt:    number;   // lockedAt + 7 days
  status:       'active' | 'filled' | 'expired' | 'cancelled';
  filledAt?:    number;
  filledPrice?: number;
}

export interface TokenIndicator {
  atr7:        number;   // 7-day ATR
  ema50:       number;   // 50-day EMA
  discountPct: number;   // recommended limit discount %
  currentPrice:number;
}

export type IndicatorMap = Record<LimitSymbol, TokenIndicator>;

// ─── Constants ────────────────────────────────────────────────────────────────

const ORDERS_KEY    = 'auto-limit-orders-v1';
const CACHE_PREFIX  = 'alt-kline-cache-v1-';
const CACHE_TTL     = 4 * 60 * 60 * 1000;  // 4 hours
const ORDER_TTL     = 7 * 24 * 60 * 60 * 1000; // 7 days

// Volatility multipliers (vs BTC ATR baseline)
const VMULT: Record<LimitSymbol, { mult: number; min: number; max: number }> = {
  BTC: { mult: 1.00, min: 2.0, max: 4.0 },
  ETH: { mult: 1.60, min: 3.0, max: 6.5 },
  SOL: { mult: 2.15, min: 4.5, max: 9.5 },
};

// Static fallbacks when API is unavailable
const FALLBACK_DISCOUNT: Record<LimitSymbol, number> = {
  BTC: 2.5, ETH: 4.0, SOL: 5.5,
};

const BINANCE_SYMBOL: Record<LimitSymbol, string> = {
  BTC: 'BTCUSDT', ETH: 'ETHUSDT', SOL: 'SOLUSDT',
};

const CG_ID: Record<LimitSymbol, string> = {
  BTC: 'bitcoin', ETH: 'ethereum', SOL: 'solana',
};

// ─── Math helpers ─────────────────────────────────────────────────────────────

function calcATR7(highs: number[], lows: number[], closes: number[]): number {
  const n = closes.length;
  if (n < 8) return 0;
  let sum = 0;
  for (let i = n - 7; i < n; i++) {
    const prev = closes[i - 1];
    sum += Math.max(highs[i] - lows[i], Math.abs(highs[i] - prev), Math.abs(lows[i] - prev));
  }
  return sum / 7;
}

function calcEMA(closes: number[], period: number): number {
  if (closes.length < period) return closes[closes.length - 1] ?? 0;
  const k = 2 / (period + 1);
  let ema = closes[closes.length - period];
  for (let i = closes.length - period + 1; i < closes.length; i++) {
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

// ─── Binance fetch with 4h cache ──────────────────────────────────────────────

interface KlineCache { ts: number; highs: number[]; lows: number[]; closes: number[] }

function readKlineCache(sym: LimitSymbol): KlineCache | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + sym);
    if (!raw) return null;
    const c = JSON.parse(raw) as KlineCache;
    if (Date.now() - c.ts > CACHE_TTL) return null;
    return c;
  } catch { return null; }
}

function writeKlineCache(sym: LimitSymbol, data: KlineCache) {
  try { localStorage.setItem(CACHE_PREFIX + sym, JSON.stringify(data)); } catch { /* quota */ }
}

async function fetchKlines(sym: LimitSymbol): Promise<{ highs: number[]; lows: number[]; closes: number[] }> {
  const cached = readKlineCache(sym);
  if (cached) return cached;

  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const url = `https://api.binance.com/api/v3/klines?symbol=${BINANCE_SYMBOL[sym]}&interval=1d&limit=55`;
    const res  = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`Binance ${sym}: ${res.status}`);
    const rows = await res.json() as [number,string,string,string,string,...unknown[]][];
    const data = {
      ts:     Date.now(),
      highs:  rows.map(k => parseFloat(k[2])),
      lows:   rows.map(k => parseFloat(k[3])),
      closes: rows.map(k => parseFloat(k[4])),
    };
    writeKlineCache(sym, data);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAllIndicators(): Promise<IndicatorMap> {
  const results = await Promise.allSettled(
    (['BTC', 'ETH', 'SOL'] as LimitSymbol[]).map(s => fetchKlines(s))
  );

  const map = {} as IndicatorMap;
  (['BTC', 'ETH', 'SOL'] as LimitSymbol[]).forEach((sym, i) => {
    const r = results[i];
    if (r.status === 'fulfilled') {
      const { highs, lows, closes } = r.value;
      const price = closes[closes.length - 1] ?? 0;
      const atr7  = calcATR7(highs, lows, closes);
      map[sym] = {
        atr7,
        ema50:       calcEMA(closes, 50),
        discountPct: discountFromATR(sym, atr7, price),
        currentPrice: price,
      };
    } else {
      // Graceful fallback: no price data
      map[sym] = { atr7: 0, ema50: 0, discountPct: FALLBACK_DISCOUNT[sym], currentPrice: 0 };
    }
  });
  return map;
}

// ─── Orders persistence ───────────────────────────────────────────────────────

type OrdersState = Record<LimitSymbol, LockedOrder | null>;

function loadOrders(): OrdersState {
  try {
    const raw = localStorage.getItem(ORDERS_KEY);
    return raw ? JSON.parse(raw) : { BTC: null, ETH: null, SOL: null };
  } catch { return { BTC: null, ETH: null, SOL: null }; }
}

function saveOrders(o: OrdersState) {
  try { localStorage.setItem(ORDERS_KEY, JSON.stringify(o)); } catch { /* quota */ }
}

// ─── Portfolio integration ────────────────────────────────────────────────────

function addToPortfolio(sym: LimitSymbol, qty: number) {
  try {
    const h = JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}') as Record<string, number>;
    const k = sym.toLowerCase();
    h[k] = (h[k] ?? 0) + qty;
    localStorage.setItem('smart-alloc-holdings', JSON.stringify(h));
    // Notify portfolio components
    window.dispatchEvent(new Event('portfolio-updated'));
  } catch { /* noop */ }
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useAutoLimitTracker() {
  const [orders, setOrders] = useState<OrdersState>(loadOrders);
  const { data: prices } = usePrices();

  // Fetch Binance klines (cached 4h)
  const { data: indicators, isLoading: indicatorsLoading } = useQuery({
    queryKey:        ['auto-limit-indicators'],
    queryFn:         fetchAllIndicators,
    staleTime:       CACHE_TTL,
    refetchInterval: CACHE_TTL,
    retry: 2,
    retryDelay: 4000,
  });

  // ── Auto-tracker: runs on every usePrices tick (30 s) ─────────────────────
  useEffect(() => {
    if (!prices) return;

    const live: Record<LimitSymbol, number> = {
      BTC: prices[CG_ID.BTC]?.usd ?? 0,
      ETH: prices[CG_ID.ETH]?.usd ?? 0,
      SOL: prices[CG_ID.SOL]?.usd ?? 0,
    };

    let changed = false;
    const next = { ...orders };

    for (const sym of ['BTC', 'ETH', 'SOL'] as LimitSymbol[]) {
      const o = next[sym];
      if (!o || o.status !== 'active') continue;

      const now   = Date.now();
      const price = live[sym];

      // Expiry check
      if (now > o.expiresAt) {
        next[sym] = { ...o, status: 'expired' };
        changed   = true;
        continue;
      }

      // Fill check: price touched or crossed the target
      if (price > 0 && price <= o.targetPrice) {
        next[sym] = { ...o, status: 'filled', filledAt: now, filledPrice: price };
        addToPortfolio(sym, o.volumeToken);
        changed   = true;
      }
    }

    if (changed) {
      setOrders(next);
      saveOrders(next);
    }
  }, [prices]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Actions ───────────────────────────────────────────────────────────────

  const lockOrder = useCallback((
    sym: LimitSymbol,
    discountPct: number,
    targetPrice: number,
    volumeUsd: number,
  ) => {
    if (targetPrice <= 0 || volumeUsd <= 0) return;
    const now: number = Date.now();
    const order: LockedOrder = {
      symbol: sym, discountPct, targetPrice,
      volumeUsd, volumeToken: volumeUsd / targetPrice,
      lockedAt: now, expiresAt: now + ORDER_TTL,
      status: 'active',
    };
    const next = { ...orders, [sym]: order };
    setOrders(next);
    saveOrders(next);
  }, [orders]);

  const cancelOrder = useCallback((sym: LimitSymbol) => {
    const next = { ...orders, [sym]: null };
    setOrders(next);
    saveOrders(next);
  }, [orders]);

  const resetOrder = useCallback((sym: LimitSymbol) => {
    const next = { ...orders, [sym]: null };
    setOrders(next);
    saveOrders(next);
  }, [orders]);

  // Effective discount for a symbol (uses indicators or fallback)
  const getDiscount = useCallback((sym: LimitSymbol, livePrice: number): number => {
    const ind = indicators?.[sym];
    if (ind && ind.currentPrice > 0) return ind.discountPct;
    if (livePrice > 0) return discountFromATR(sym, 0, livePrice); // uses fallback
    return FALLBACK_DISCOUNT[sym];
  }, [indicators]);

  return {
    orders,
    indicators,
    indicatorsLoading,
    lockOrder,
    cancelOrder,
    resetOrder,
    getDiscount,
  };
}

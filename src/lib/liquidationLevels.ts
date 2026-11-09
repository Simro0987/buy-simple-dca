/**
 * Global synchronized store for user-recorded DeFi liquidation prices
 * per asset. Persisted in localStorage; reactive via useSyncExternalStore.
 *
 * Buffer rule: when the live market price is within `BUFFER_PCT` (15%)
 * above the recorded liquidation level, asset is in CRITICAL state.
 */
import { useSyncExternalStore } from 'react';

export type LiqSymbol = 'BTC' | 'ETH' | 'SOL';

export interface LiquidationState {
  levels: Partial<Record<LiqSymbol, number>>; // USD price at which position liquidates
}

const KEY = 'liquidation-levels-v1';
export const BUFFER_PCT = 15; // %

const DEFAULT: LiquidationState = { levels: {} };

function load(): LiquidationState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT;
    const parsed = JSON.parse(raw);
    return { levels: parsed.levels ?? {} };
  } catch { return DEFAULT; }
}

let state: LiquidationState = load();
const listeners = new Set<() => void>();

function emit() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach(l => l());
}

function subscribe(l: () => void) { listeners.add(l); return () => listeners.delete(l); }
function getSnapshot() { return state; }

export function setLiquidationLevel(symbol: LiqSymbol, price: number | null) {
  const next = { ...state.levels };
  if (price == null || !Number.isFinite(price) || price <= 0) {
    delete next[symbol];
  } else {
    next[symbol] = price;
  }
  state = { levels: next };
  emit();
}

export function useLiquidationLevels() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export interface LiquidationStatus {
  symbol: LiqSymbol;
  liqPrice: number;
  marketPrice: number;
  distancePct: number;   // (market - liq) / liq * 100
  critical: boolean;     // within BUFFER_PCT above liq (or below)
}

/** Returns status only for symbols with a recorded level and a valid market price. */
export function evaluateLiquidations(
  prices: Partial<Record<LiqSymbol, number>>,
): LiquidationStatus[] {
  const out: LiquidationStatus[] = [];
  (Object.keys(state.levels) as LiqSymbol[]).forEach(sym => {
    const liq = state.levels[sym];
    const mkt = prices[sym];
    if (!liq || !mkt || liq <= 0 || mkt <= 0) return;
    const distancePct = ((mkt - liq) / liq) * 100;
    const critical = distancePct <= BUFFER_PCT; // includes already-below-liq
    out.push({ symbol: sym, liqPrice: liq, marketPrice: mkt, distancePct, critical });
  });
  return out;
}

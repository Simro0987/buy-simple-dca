/**
 * Single source of truth for take-profit recommendations.
 * The main Portfolio card (UnifiedAssetCard) publishes its computed result here;
 * the "Vybrať zisk" modal only reads it — it never computes its own sell amount.
 */
import { useSyncExternalStore } from 'react';

export interface TakeProfitRecommendation {
  symbol: string;
  sellQty: number;
  sellUsd: number;
  pnlUsd: number;
  pnlPct: number | null;
  price: number;
  hold: boolean;
  /** Text shown on the card (e.g. "Nič — zisk necháme v BTC") */
  label: string;
  destination: string;
}

const store = new Map<string, TakeProfitRecommendation>();
const listeners = new Set<() => void>();
let version = 0;

const norm = (s: string) => s.toUpperCase();

export function publishTakeProfit(rec: TakeProfitRecommendation) {
  const key = norm(rec.symbol);
  const prev = store.get(key);
  if (prev && JSON.stringify(prev) === JSON.stringify(rec)) return;
  store.set(key, rec);
  version++;
  listeners.forEach(l => l());
}

export function useTakeProfitRecommendation(symbol: string): TakeProfitRecommendation | undefined {
  useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb); },
    () => version,
  );
  return store.get(norm(symbol));
}

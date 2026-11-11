/**
 * Držby aktív bez DCA skórovania (wBTC, ZEC, PAXG, USDC, USDT).
 * Rovnaký pattern ako `portfolioHoldings` — localStorage + useSyncExternalStore.
 */
import { useSyncExternalStore } from 'react';
import { EXTRA_ASSETS, type ExtraAsset } from '@/lib/portfolioCategories';

export interface ExtraEntry { qty: number; wacb: number }
export type ExtraState = Record<ExtraAsset, ExtraEntry>;

const KEY = 'portfolio-extra-assets-v1';

const EMPTY: ExtraState = EXTRA_ASSETS.reduce((acc, t) => {
  acc[t] = { qty: 0, wacb: 0 };
  return acc;
}, {} as ExtraState);

function sanitize(raw: unknown): ExtraState {
  const src = (raw ?? {}) as Partial<Record<ExtraAsset, Partial<ExtraEntry>>>;
  const out = {} as ExtraState;
  for (const t of EXTRA_ASSETS) {
    const qty = Number(src[t]?.qty);
    const wacb = Number(src[t]?.wacb);
    out[t] = {
      qty: Number.isFinite(qty) && qty > 0 ? qty : 0,
      wacb: Number.isFinite(wacb) && wacb > 0 ? wacb : 0,
    };
  }
  return out;
}

function load(): ExtraState {
  try { return sanitize(JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { return EMPTY; }
}

let state: ExtraState = load();
const listeners = new Set<() => void>();

function emit() {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* ignore */ }
  listeners.forEach((l) => l());
}

export function setExtraAsset(asset: ExtraAsset, patch: Partial<ExtraEntry>) {
  const cur = state[asset];
  state = {
    ...state,
    [asset]: {
      qty: patch.qty != null ? (Number.isFinite(patch.qty) && patch.qty > 0 ? patch.qty : 0) : cur.qty,
      wacb: patch.wacb != null ? (Number.isFinite(patch.wacb) && patch.wacb > 0 ? patch.wacb : 0) : cur.wacb,
    },
  };
  emit();
}

export function resetExtraAssets() { state = EMPTY; emit(); }
export function getExtraAssets(): ExtraState { return state; }

export function useExtraAssetsState(): ExtraState {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => state,
    () => state,
  );
}

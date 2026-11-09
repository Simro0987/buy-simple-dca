/**
 * Global per-asset Borrow (debt) store — USD-denominated loans taken against
 * an asset's collateral (e.g. USDC borrowed against BTC/ETH in Layer 3).
 * localStorage + window event broadcast; fully dynamic for any symbol.
 */
import { useEffect, useState } from 'react';

const KEY = 'asset-debt-store-v1';
const EVT = 'asset-debt-store-changed';

export type DebtMap = Record<string, number>; // SYMBOL -> borrowed USD

function load(): DebtMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as DebtMap) : {};
  } catch { return {}; }
}

function persist(m: DebtMap) {
  try {
    localStorage.setItem(KEY, JSON.stringify(m));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch { /* ignore */ }
}

export function getAssetDebts(): DebtMap { return load(); }

/** Increase debt against `symbol` by `usd` (Borrow). */
export function addAssetDebt(symbol: string, usd: number): void {
  if (!(usd > 0) || !symbol) return;
  const s = symbol.toUpperCase();
  const m = load();
  m[s] = (m[s] ?? 0) + usd;
  persist(m);
}

/** Decrease debt against `symbol` by `usd` (Repay). Returns amount actually repaid. */
export function repayAssetDebt(symbol: string, usd: number): number {
  if (!(usd > 0) || !symbol) return 0;
  const s = symbol.toUpperCase();
  const m = load();
  const cur = m[s] ?? 0;
  const paid = Math.min(cur, usd);
  const next = cur - paid;
  if (next <= 1e-9) delete m[s]; else m[s] = next;
  persist(m);
  return paid;
}

export function useAssetDebts(): DebtMap {
  const [debts, setDebts] = useState<DebtMap>(() => load());
  useEffect(() => {
    const sync = () => setDebts(load());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return debts;
}

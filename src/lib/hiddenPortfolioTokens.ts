/**
 * Skryté tokeny v Portfóliu.
 *
 * „Odstrániť token“ iba schová token zo zoznamu v UI — transakcie
 * a teda aj VYBRANÉ ZISKY (realized profit) zostávajú v databáze
 * a naďalej sa počítajú do globálnej metriky.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'portfolio-hidden-tokens';
export const HIDDEN_TOKENS_EVENT = 'portfolio-hidden-tokens-changed';

const listeners = new Set<() => void>();
let cache: string[] = load();
let snapshot = cache.join(',');

/**
 * Povinné tokene košov (XMR v SATELITOCH, ENA v HIGH-BETA) — nikdy sa nesmú
 * zostať skryté zo starej uloženej verzie (napr. v publikovanej appke).
 * Pri každom načítaní sa uložený stav zlúči s aktuálnymi pravidlami.
 */
const MANDATORY_VISIBLE = new Set<string>();

function load(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '[]');
    const list = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
    const clean = list.filter(id => !MANDATORY_VISIBLE.has(id.toLowerCase()));
    if (clean.length !== list.length) {
      try { localStorage.setItem(KEY, JSON.stringify(clean)); } catch { /* ignore */ }
    }
    return clean;
  } catch {
    return [];
  }
}

function persist(next: string[]) {
  cache = next;
  snapshot = next.join(',');
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
  listeners.forEach(l => l());
  try { window.dispatchEvent(new Event(HIDDEN_TOKENS_EVENT)); } catch { /* ignore */ }
}

export function getHiddenTokens(): string[] {
  return cache;
}

export function isTokenHidden(coingeckoId: string): boolean {
  return cache.includes(coingeckoId);
}

export function hideToken(coingeckoId: string): void {
  if (MANDATORY_VISIBLE.has(coingeckoId.toLowerCase())) return;
  if (cache.includes(coingeckoId)) return;
  persist([...cache, coingeckoId]);
}

export function unhideToken(coingeckoId: string): void {
  if (!cache.includes(coingeckoId)) return;
  persist(cache.filter(id => id !== coingeckoId));
}

export function useHiddenTokens(): string[] {
  const key = useSyncExternalStore(
    l => {
      listeners.add(l);
      const sync = () => { cache = load(); snapshot = cache.join(','); l(); };
      window.addEventListener('storage', sync);
      return () => { listeners.delete(l); window.removeEventListener('storage', sync); };
    },
    () => snapshot,
    () => snapshot,
  );
  return key ? key.split(',') : [];
}

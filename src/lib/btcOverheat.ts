/**
 * Globálny, reaktívny stav BTC overheat skóre (0–100).
 * Altcoin routing logika (zisky → wBTC) si ho môže prečítať odkiaľkoľvek
 * cez `getBtcOverheatScore()` (sync) alebo `useBtcOverheatScore()` (React).
 */
import { useSyncExternalStore } from 'react';

let btcOverheatScore = 0;
const listeners = new Set<() => void>();

export function getBtcOverheatScore(): number {
  return btcOverheatScore;
}

export function setBtcOverheatScore(value: number): void {
  const next = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  if (Math.abs(next - btcOverheatScore) < 0.01) return;
  btcOverheatScore = next;
  listeners.forEach((l) => l());
}

export function useBtcOverheatScore(): number {
  return useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    () => btcOverheatScore,
    () => btcOverheatScore,
  );
}

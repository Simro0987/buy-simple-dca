/**
 * Global "Active Staking" store — every confirmed staking execution from the
 * Stake section lands here (localStorage + window event broadcast) so the
 * Portfolio section can render it instantly. Fully dynamic: any token symbol
 * and any protocol works without code changes.
 */
import { useCallback, useEffect, useState } from 'react';

const KEY = 'active-staking-store-v1';
const EVT = 'active-staking-store-changed';

/** Nested balance state the position lives in (never a sale — pure state transfer). */
export type StakeKind = 'staked' | 'collateral';

export interface ActiveStakeRecord {
  id: string;        // `${symbol}|${protocol}`
  symbol: string;
  protocol: string;
  amount: number;
  apy?: number;      // APY/APR snapshot at confirmation time (live value)
  kind?: StakeKind;  // default 'staked'
  ts: number;
}

type Store = Record<string, ActiveStakeRecord>;

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch { return {}; }
}

function persist(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
    window.dispatchEvent(new CustomEvent(EVT));
  } catch { /* ignore */ }
}

export function stakeId(symbol: string, protocol: string) {
  return `${symbol.toUpperCase()}|${protocol}`;
}

/** Record (or accumulate) a confirmed stake / collateral supply. Safe to call from any tab. */
export function recordActiveStake(
  symbol: string,
  protocol: string,
  amount: number,
  apy?: number,
  kind: StakeKind = 'staked',
): void {
  if (!(amount > 0) || !symbol || !protocol) return;
  const id = stakeId(symbol, protocol);
  const current = load();
  const prev = current[id];
  current[id] = {
    id,
    symbol: symbol.toUpperCase(),
    protocol,
    amount: (prev?.amount ?? 0) + amount,
    apy: apy ?? prev?.apy,
    kind: kind ?? prev?.kind ?? 'staked',
    ts: Date.now(),
  };
  persist(current);
}

/** Reverse transfer (unstake / withdraw collateral) — moves amount back to Liquid. */
export function reduceActiveStake(symbol: string, protocol: string, amount: number): number {
  if (!(amount > 0) || !symbol || !protocol) return 0;
  const id = stakeId(symbol, protocol);
  const current = load();
  const prev = current[id];
  if (!prev) return 0;
  const taken = Math.min(prev.amount, amount);
  const next = prev.amount - taken;
  if (next <= 1e-12) delete current[id];
  else current[id] = { ...prev, amount: next, ts: Date.now() };
  persist(current);
  return taken;
}

export function removeActiveStake(id: string): void {
  const current = load();
  delete current[id];
  persist(current);
}

export function getActiveStakes(): ActiveStakeRecord[] {
  return Object.values(load()).sort((a, b) => b.ts - a.ts);
}

/** Reactive list of all executed stakes across every token. */
export function useActiveStakes() {
  const [records, setRecords] = useState<ActiveStakeRecord[]>(() => getActiveStakes());

  useEffect(() => {
    const sync = () => setRecords(getActiveStakes());
    window.addEventListener(EVT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const remove = useCallback((id: string) => {
    removeActiveStake(id);
    setRecords(getActiveStakes());
  }, []);

  return { records, remove };
}

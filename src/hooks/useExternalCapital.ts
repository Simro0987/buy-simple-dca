import { useCallback, useEffect, useMemo, useState } from 'react';
import { useWalletBalances } from './useWalletBalances';
import { loadTrackedAddresses } from '@/contexts/WalletContext';
import type { WalletEntry } from '@/lib/wallets';

const EXTERNAL_KEY = 'external-base-usdc-v1';
const EXTERNAL_EVENT = 'external-base-usdc-changed';
const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'USDC.E', 'USDBC']);

function readExternal(): number {
  try {
    const raw = localStorage.getItem(EXTERNAL_KEY);
    if (!raw) return 0;
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeExternal(value: number): void {
  try {
    localStorage.setItem(EXTERNAL_KEY, String(value));
    window.dispatchEvent(new CustomEvent(EXTERNAL_EVENT));
  } catch { /* ignore */ }
}

function useTrackedWalletEntries(): WalletEntry[] {
  const [entries, setEntries] = useState<WalletEntry[]>(() => buildEntries());

  useEffect(() => {
    const refresh = () => setEntries(buildEntries());
    window.addEventListener('storage', refresh);
    window.addEventListener('tracked-addresses-changed', refresh);
    const t = setInterval(refresh, 5_000);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('tracked-addresses-changed', refresh);
      clearInterval(t);
    };
  }, []);

  return entries;
}

function buildEntries(): WalletEntry[] {
  const tracked = loadTrackedAddresses();
  const out: WalletEntry[] = [];
  if (tracked.solana) {
    out.push({ id: 'tracked-sol', chain: 'sol', label: 'Tracked SOL', address: tracked.solana });
  }
  if (tracked.evm) {
    out.push({ id: 'tracked-eth', chain: 'eth', label: 'Tracked EVM (Mainnet)', address: tracked.evm });
    out.push({ id: 'tracked-arb', chain: 'arb', label: 'Tracked EVM (Arbitrum)', address: tracked.evm });
  }
  return out;
}

export function useExternalCapital() {
  const [external, setExternalState] = useState<number>(() => readExternal());

  useEffect(() => {
    const handler = () => setExternalState(readExternal());
    window.addEventListener('storage', handler);
    window.addEventListener(EXTERNAL_EVENT, handler);
    return () => {
      window.removeEventListener('storage', handler);
      window.removeEventListener(EXTERNAL_EVENT, handler);
    };
  }, []);

  const setExternal = useCallback((n: number) => {
    const v = Number.isFinite(n) && n >= 0 ? n : 0;
    setExternalState(v);
    writeExternal(v);
  }, []);

  const entries = useTrackedWalletEntries();
  const { data: balances } = useWalletBalances(entries);

  const fetchedStables = useMemo(() => {
    if (!balances) return 0;
    let total = 0;
    for (const chain of ['eth', 'sol', 'arb'] as const) {
      for (const r of balances[chain] ?? []) {
        if (!r.ok || !r.tokens) continue;
        for (const tok of r.tokens) {
          if (STABLE_SYMBOLS.has(tok.symbol.toUpperCase())) {
            // Stablecoins ≈ $1
            total += tok.balance;
          }
        }
      }
    }
    return total;
  }, [balances]);

  const total = fetchedStables + external;

  return { external, setExternal, fetchedStables, total };
}

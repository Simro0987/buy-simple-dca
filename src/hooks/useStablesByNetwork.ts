// Per-sieťové stable balances pre Kokpit Režim deficit kalkulácie.
// Mapuje sledované wallet adresy + manuálny Base USDC na USD totals
// na ethereum, arbitrum, base a solana sieťach.

import { useEffect, useMemo, useState } from 'react';
import { useWalletBalances } from './useWalletBalances';
import { loadTrackedAddresses } from '@/contexts/WalletContext';
import type { WalletEntry } from '@/lib/wallets';

const EXTERNAL_KEY = 'external-base-usdc-v1';
const STABLE_SYMBOLS = new Set(['USDC', 'USDT', 'USDC.E', 'USDBC', 'DAI']);

export type StableChain = 'ethereum' | 'arbitrum' | 'base' | 'solana';

export interface StablesByNetwork {
  ethereum: number;
  arbitrum: number;
  base: number;
  solana: number;
}

function readExternalBase(): number {
  try {
    const raw = localStorage.getItem(EXTERNAL_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch { return 0; }
}

function buildEntries(): WalletEntry[] {
  const tracked = loadTrackedAddresses();
  const out: WalletEntry[] = [];
  if (tracked.solana) {
    out.push({ id: 'cockpit-sol', chain: 'sol', label: 'Cockpit SOL', address: tracked.solana });
  }
  if (tracked.evm) {
    out.push({ id: 'cockpit-eth', chain: 'eth', label: 'Cockpit EVM Mainnet', address: tracked.evm });
    out.push({ id: 'cockpit-arb', chain: 'arb', label: 'Cockpit Arbitrum', address: tracked.evm });
  }
  return out;
}

export function useStablesByNetwork(): StablesByNetwork {
  const [entries, setEntries] = useState<WalletEntry[]>(() => buildEntries());
  const [external, setExternal] = useState<number>(() => readExternalBase());

  useEffect(() => {
    const refreshEntries = () => setEntries(buildEntries());
    const refreshExternal = () => setExternal(readExternalBase());
    window.addEventListener('tracked-addresses-changed', refreshEntries);
    window.addEventListener('external-base-usdc-changed', refreshExternal);
    window.addEventListener('storage', refreshEntries);
    window.addEventListener('storage', refreshExternal);
    return () => {
      window.removeEventListener('tracked-addresses-changed', refreshEntries);
      window.removeEventListener('external-base-usdc-changed', refreshExternal);
      window.removeEventListener('storage', refreshEntries);
      window.removeEventListener('storage', refreshExternal);
    };
  }, []);

  const { data: balances } = useWalletBalances(entries);

  return useMemo<StablesByNetwork>(() => {
    const totals: StablesByNetwork = { ethereum: 0, arbitrum: 0, base: external, solana: 0 };
    if (!balances) return totals;
    const sum = (rows: typeof balances.eth | undefined): number => {
      if (!rows) return 0;
      let n = 0;
      for (const r of rows) {
        if (!r.ok || !r.tokens) continue;
        for (const tok of r.tokens) {
          if (STABLE_SYMBOLS.has(tok.symbol.toUpperCase())) n += tok.balance;
        }
      }
      return n;
    };
    totals.ethereum = sum(balances.eth);
    totals.arbitrum = sum(balances.arb);
    totals.solana = sum(balances.sol);
    return totals;
  }, [balances, external]);
}

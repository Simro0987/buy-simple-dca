import { useEffect, useState } from 'react';
import { getLedger, STAKING_LEDGER_EVENT, type StakedEntry, type LedgerSymbol } from '@/lib/stakingLedger';

// Reactive snapshot of the manual staking ledger. Re-renders on every change event.
export function useStakingLedger() {
  const [entries, setEntries] = useState<StakedEntry[]>(() => getLedger());

  useEffect(() => {
    const refresh = () => setEntries(getLedger());
    window.addEventListener(STAKING_LEDGER_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(STAKING_LEDGER_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const bySymbol: Record<LedgerSymbol, number> = { BTC: 0, ETH: 0, SOL: 0 };
  const breakdown: Record<LedgerSymbol, StakedEntry[]> = { BTC: [], ETH: [], SOL: [] };
  for (const e of entries) {
    bySymbol[e.symbol] += e.amount;
    breakdown[e.symbol].push(e);
  }

  return { entries, bySymbol, breakdown };
}

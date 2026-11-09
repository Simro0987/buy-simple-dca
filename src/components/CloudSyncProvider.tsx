/**
 * CloudSyncProvider — hydrates all cloud-backed local caches on auth change
 * and keeps them in sync with the DB. Localstorage is no longer a source of
 * truth for holdings, staking or DeFi debt.
 *
 * On sign-in:
 *  1. Loads staking_positions -> stakingLedger cache
 *  2. Loads defi_positions -> ethDebt + cyborgPortfolio caches
 *  3. Purges legacy localStorage keys once
 *  4. Bridges `useGlobalBalances` -> writes derived `smart-alloc-holdings`
 *     cache in localStorage for legacy synchronous consumers. Reads only —
 *     writes must go through the DB.
 */
import { useEffect, ReactNode } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { hydrateStakingLedger } from '@/lib/stakingLedger';
import { setEthDebtUser, setEthDebtCache } from '@/lib/ethDebt';
import { setCyborgUser, setCyborgUsdcDebtCache, setCyborgConfirmedCache, type ConfirmedStepData } from '@/lib/cyborgPortfolio';
import { useGlobalBalances } from '@/hooks/useGlobalBalances';
import { useQueryClient } from '@tanstack/react-query';
import { migrateManualBaseToHistory, resetLocalStakeStateOnce } from '@/lib/manualBaseMigration';

const LEGACY_KEYS = [
  'staking-ledger-v1',
  'eth-borrow-debt-v1',
  'cyborg-usdc-debt-v1',
  'cyborg-confirmed-steps-v1',
];

function purgeLegacyOnce(): void {
  try {
    if (localStorage.getItem('cloud-sync-legacy-purged-v1')) return;
    for (const k of LEGACY_KEYS) localStorage.removeItem(k);
    localStorage.setItem('cloud-sync-legacy-purged-v1', '1');
  } catch { /* noop */ }
}

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const { data: balances } = useGlobalBalances();
  const qc = useQueryClient();

  // One-time: manual base balances → history (stops double counting).
  useEffect(() => {
    if (!userId) return;
    resetLocalStakeStateOnce();
    void migrateManualBaseToHistory().then((changed) => {
      if (!changed) return;
      qc.invalidateQueries({ queryKey: ['token_transactions'] });
      qc.invalidateQueries({ queryKey: ['avgBuyPrices'] });
      qc.invalidateQueries({ queryKey: ['globalBalances'] });
    });
  }, [userId, qc]);

  // Hydrate staking + defi caches on auth change
  useEffect(() => {
    purgeLegacyOnce();
    setEthDebtUser(userId);
    setCyborgUser(userId);
    if (!userId) {
      setEthDebtCache(0);
      setCyborgUsdcDebtCache(0);
      setCyborgConfirmedCache({});
      void hydrateStakingLedger(null);
      return;
    }
    void hydrateStakingLedger(userId);
    void (async () => {
      const { data } = await supabase
        .from('defi_positions')
        .select('eth_debt,usdc_debt,confirmed_steps')
        .eq('user_id', userId)
        .maybeSingle();
      setEthDebtCache(Number(data?.eth_debt ?? 0));
      setCyborgUsdcDebtCache(Number(data?.usdc_debt ?? 0));
      setCyborgConfirmedCache((data?.confirmed_steps as unknown as Record<string, ConfirmedStepData>) ?? {});
    })();
  }, [userId]);

  // Bridge globalBalances -> read-only `smart-alloc-holdings` cache for
  // legacy sync consumers. Writes to that key are forbidden elsewhere.
  useEffect(() => {
    if (!balances) return;
    try {
      const map: Record<string, number> = {};
      for (const [sym, qty] of Object.entries(balances)) {
        map[sym.toLowerCase()] = qty;
      }
      localStorage.setItem('smart-alloc-holdings', JSON.stringify(map));
      window.dispatchEvent(new CustomEvent('smart-alloc-holdings-changed'));
    } catch { /* noop */ }
  }, [balances]);

  return <>{children}</>;
}

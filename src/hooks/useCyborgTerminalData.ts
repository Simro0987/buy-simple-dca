import { useCallback, useEffect, useState } from 'react';
import { fetchCyborgMarketData, type CyborgMarketSnapshot } from '@/lib/cyborgTerminalData';
import { fetchCyborgOnChainBalances, type CyborgOnChainBalances } from '@/lib/cyborgBlockchain';
import { computeNetYield } from '@/lib/cyborgTerminalEngine';
import { clearApiCache } from '@/lib/apiCache';
import { useWalletContext } from '@/contexts/WalletContext';

export interface CyborgTerminalState {
  market: CyborgMarketSnapshot | null;
  balances: CyborgOnChainBalances | null;
  loading: boolean;
  updating: boolean;
  netYield: number | null;
  error: string | null;
}

export function useCyborgTerminalData(lang: 'sk' | 'en') {
  const { hasAllAddresses, addresses } = useWalletContext();
  const [market, setMarket] = useState<CyborgMarketSnapshot | null>(null);
  const [balances, setBalances] = useState<CyborgOnChainBalances | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    if (!hasAllAddresses) {
      setLoading(false);
      setUpdating(false);
      return;
    }

    const isInitial = market === null && balances === null;
    if (isInitial) setLoading(true);
    else setUpdating(true);

    try {
      if (force) clearApiCache('cyborg');

      const [marketSnap, balanceSnap] = await Promise.all([
        fetchCyborgMarketData({ force }),
        fetchCyborgOnChainBalances(addresses.evmArbitrum, addresses.solana, { force }),
      ]);

      setMarket(marketSnap);
      setBalances(balanceSnap);
      setError(null);
    } catch (e) {
      setError(lang === 'sk' ? 'Chyba: API offline' : 'Error: API Offline');
      console.error('Cyborg refresh failed:', e);
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  }, [hasAllAddresses, addresses.evmArbitrum, addresses.solana, market, balances, lang]);

  const forceRefresh = useCallback(() => refresh(true), [refresh]);

  useEffect(() => {
    void refresh(false);
  }, [hasAllAddresses, addresses.evmArbitrum, addresses.solana]); // eslint-disable-line react-hooks/exhaustive-deps

  const netYield =
    market?.lbtcApy != null && market?.usdcBorrowApy != null
      ? computeNetYield(market.lbtcApy, market.usdcBorrowApy)
      : null;

  return {
    market,
    balances,
    loading,
    updating,
    refresh: forceRefresh,
    netYield,
    error,
    hasAddresses: hasAllAddresses,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { fetchCyborgMarketData, type CyborgMarketSnapshot } from '@/lib/cyborgTerminalData';
import { computeNetYield } from '@/lib/cyborgTerminalEngine';
import { clearApiCache } from '@/lib/apiCache';

export function useCyborgMarketData() {
  const [market, setMarket] = useState<CyborgMarketSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = false) => {
    const isInitial = market === null;
    if (isInitial) setLoading(true);
    else setUpdating(true);

    try {
      if (force) clearApiCache('cyborg');
      const marketSnap = await fetchCyborgMarketData({ force });
      setMarket(marketSnap);
      setError(marketSnap.errors.length > 0 ? 'Error: API Offline' : null);
    } catch {
      setError('Error: API Offline');
    } finally {
      setLoading(false);
      setUpdating(false);
    }
  }, [market]);

  useEffect(() => {
    void refresh(false);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const netYield =
    market?.lbtcApy != null && market?.usdcBorrowApy != null
      ? computeNetYield(market.lbtcApy, market.usdcBorrowApy)
      : null;

  return {
    market,
    loading,
    updating,
    refresh: () => refresh(true),
    netYield,
    error,
  };
}

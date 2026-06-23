import { useCallback, useEffect, useState } from 'react';
import { fetchCyborgMarketData, type CyborgMarketSnapshot } from '@/lib/cyborgTerminalData';
import { computeNetYield } from '@/lib/cyborgTerminalEngine';
import { clearApiCache } from '@/lib/apiCache';

export function useCyborgMarketData() {
  const [market, setMarket] = useState<CyborgMarketSnapshot | null>(null);
  const [marketLoading, setMarketLoading] = useState(true);
  const [updating, setUpdating] = useState(false);

  const refresh = useCallback(async (force = false) => {
    const isInitial = market === null;
    if (isInitial) setMarketLoading(true);
    else setUpdating(true);

    try {
      if (force) clearApiCache('cyborg');
      const marketSnap = await fetchCyborgMarketData({ force });
      setMarket(marketSnap);
    } catch {
      setMarket(prev => prev ?? {
        fearGreed: null,
        fearGreedClassification: null,
        btcRsi: null,
        prices: { btc: null, eth: null, sol: null },
        lbtcApy: null,
        usdcBorrowApy: null,
        kaminoApy: null,
        rocketPoolApy: null,
        marinadeApy: null,
        lbtcPriceUsd: null,
        unavailable: ['Market data'],
        stale: false,
        fetchedAt: new Date(),
        ready: true,
      });
    } finally {
      setMarketLoading(false);
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
    marketLoading,
    updating,
    refresh: () => refresh(true),
    netYield,
    unavailable: market?.unavailable ?? [],
  };
}

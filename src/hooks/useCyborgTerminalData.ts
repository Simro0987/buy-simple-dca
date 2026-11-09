import { useCallback, useEffect, useMemo, useState } from 'react';
import { fetchCyborgMarketData, type CyborgMarketSnapshot } from '@/lib/cyborgTerminalData';
import { sanitizeLbtcSupplyApy, sanitizeMorphoBorrowApy } from '@/lib/cyborgTerminalEngine';
import { clearApiCache } from '@/lib/apiCache';

/** Terminal-exclusive market data: F&G, RSI, Morpho borrow, LBTC supply APY. */
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

  const usdcBorrow = useMemo(
    () => sanitizeMorphoBorrowApy(market?.usdcBorrowApy),
    [market?.usdcBorrowApy],
  );

  const lbtcSupply = useMemo(
    () => sanitizeLbtcSupplyApy(market?.lbtcApy),
    [market?.lbtcApy],
  );

  return {
    market,
    marketLoading,
    updating,
    refresh: () => refresh(true),
    unavailable: market?.unavailable ?? [],
    terminalApys: {
      usdcBorrow,
      lbtcSupply,
    },
  };
}

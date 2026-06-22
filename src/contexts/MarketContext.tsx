import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useFearGreed, usePrices } from '@/hooks/usePrices';
import { useMarketData } from '@/hooks/useMarketData';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import { runCoreSatelliteEngine, type EngineResult } from '@/lib/coreSatelliteEngine';
import { getLatestMarketScore } from '@/lib/dcaScoreBridge';

interface MarketContextValue {
  engine: EngineResult;
  isLoading: boolean;
  isDegraded: boolean;
}

const MarketContext = createContext<MarketContextValue | null>(null);

const CBBC_AVG = (95 + 92 + 84) / 3; // BTC/ETH/SOL baseline composite
const ETH_CBBC = 92;
const SOL_CBBC = 84;
const SOL_VOL_BASELINE = 4.0; // historical 14D daily stdev baseline for SOL

export function MarketProvider({ children }: { children: ReactNode }) {
  const { data: fg, isLoading: fgLoading } = useFearGreed();
  const { data: market, isLoading: mdLoading } = useMarketData();
  const { data: prices, isLoading: pLoading } = usePrices();
  const { data: metrics, isLoading: mLoading } = usePerCoinMetrics();

  const engine = useMemo<EngineResult>(() => {
    const btcPrice = market?.btc?.price && market.btc.price > 0 ? market.btc.price : (prices?.bitcoin?.usd ?? 0);
    const btcWma = market?.btc?.ma200w ?? 0;
    const btcWmaStale = market?.btc?.ma200wStale === true;
    // 200WMA is BTC-ONLY. Hard sanity guard: reject ghost values >20% deviation.
    let btcWmaDist: number | null = null;
    if (!btcWmaStale && btcPrice > 0 && btcWma > 0) {
      const dev = ((btcPrice - btcWma) / btcWma) * 100;
      if (Math.abs(dev) > 20) {
        console.error(`[MarketContext] Cache Stale — BTC 200WMA dev ${dev.toFixed(1)}% > 20%. Suppressing.`);
      } else {
        btcWmaDist = dev;
      }
    }
    return runCoreSatelliteEngine({
      btcWmaDistPct: btcWmaDist,
      fearGreed: typeof fg?.value === 'number' ? fg.value : null,
      cbbcAvg: CBBC_AVG,
      ethCbbc: ETH_CBBC,
      solCbbc: SOL_CBBC,
      solTvlUsd: market?.sol?.tvl ?? null,
      btcVol14d: metrics?.btc?.volatility30d ?? 2.0,
      ethVol14d: metrics?.eth?.volatility30d ?? 2.8,
      solVol14d: metrics?.sol?.volatility30d ?? 4.0,
      solVol14dBaseline: SOL_VOL_BASELINE,
      marketScore: getLatestMarketScore(),
    });
  }, [fg, market, prices, metrics]);

  const value: MarketContextValue = {
    engine,
    isLoading: fgLoading || mdLoading || pLoading || mLoading,
    isDegraded: market?.degraded === true,
  };

  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarketEngine(): MarketContextValue {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarketEngine must be used inside <MarketProvider>');
  return ctx;
}

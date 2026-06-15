import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useFearGreed, usePrices } from '@/hooks/usePrices';
import { useMarketData } from '@/hooks/useMarketData';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import { runCoreSatelliteEngine, type EngineResult } from '@/lib/coreSatelliteEngine';

interface MarketContextValue {
  engine: EngineResult;
  isLoading: boolean;
  isDegraded: boolean;
}

const MarketContext = createContext<MarketContextValue | null>(null);

const CBBC_AVG = (95 + 92 + 84) / 3; // BTC/ETH/SOL baseline composite

export function MarketProvider({ children }: { children: ReactNode }) {
  const { data: fg, isLoading: fgLoading } = useFearGreed();
  const { data: market, isLoading: mdLoading } = useMarketData();
  const { data: prices, isLoading: pLoading } = usePrices();
  const { data: metrics, isLoading: mLoading } = usePerCoinMetrics();

  const engine = useMemo<EngineResult>(() => {
    const btcPrice = market?.btc?.price && market.btc.price > 0 ? market.btc.price : (prices?.bitcoin?.usd ?? 0);
    const ethPrice = prices?.ethereum?.usd ?? 0;
    const btcWma = market?.btc?.ma200w ?? 0;
    const ethWma = market?.eth?.ma200w ?? 0;
    return runCoreSatelliteEngine({
      btcWmaDistPct: btcPrice > 0 && btcWma > 0 ? ((btcPrice - btcWma) / btcWma) * 100 : null,
      ethWmaDistPct: ethPrice > 0 && ethWma > 0 ? ((ethPrice - ethWma) / ethWma) * 100 : null,
      fearGreed: typeof fg?.value === 'number' ? fg.value : null,
      cbbcAvg: CBBC_AVG,
      solTvlUsd: market?.sol?.tvl ?? null,
      btcVol14d: metrics?.btc?.volatility30d ?? 2.0,
      ethVol14d: metrics?.eth?.volatility30d ?? 2.8,
      solVol14d: metrics?.sol?.volatility30d ?? 4.0,
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

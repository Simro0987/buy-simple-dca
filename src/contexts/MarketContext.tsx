import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFearGreed } from '@/hooks/usePrices';
import { useMarketData } from '@/hooks/useMarketData';
import { useBtc200wSma } from '@/hooks/useBtc200wSma';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import { useDefiApys } from '@/hooks/useDefiApys';
import { useConfluenceMetrics } from '@/hooks/useConfluenceMetrics';
import { runCoreSatelliteEngine, type EngineResult } from '@/lib/coreSatelliteEngine';
import { readRatioState, writeRatioState } from '@/lib/macroRatioSmoothing';
import { RYI_DEFAULTS } from '@/lib/ryi';


// Network inflation constants — hardcoded (no reliable free API without key).
// Combined with LIVE staking APY from DefiLlama for a real-time RYI.
const ETH_INFLATION = 0.5; // %
const SOL_INFLATION = 5.0; // %

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
  const { data: bn } = useBtc200wSma();
  const { data: metrics, isLoading: mLoading } = usePerCoinMetrics();
  const { data: apys } = useDefiApys();
  const { metrics: confluence } = useConfluenceMetrics();

  // Confluence skóre (0..100) = priemer BTC osí z Confluence Octagonu.
  const confluenceScore = useMemo(() => {
    const axes = confluence?.BTC?.axes ?? [];
    const vals = axes.map(a => Number(a.value)).filter(v => Number.isFinite(v));
    return vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
  }, [confluence]);

  // Persistovaný stav vyhladenia makro pomeru — načíta sa raz, aby EMA prežila reload.
  const ratioStateRef = useRef(readRatioState());



  // LIVE RYI inputs — Gross Staking APY from DefiLlama + hardcoded inflation.
  // Graceful fallback: if apys undefined/failed, useDefiApys returns FALLBACK constants.
  const ethRyi = {
    apy: apys?.lido ?? RYI_DEFAULTS.eth.apy,
    inflation: ETH_INFLATION,
  };
  const solRyi = {
    apy: apys?.jito ?? RYI_DEFAULTS.sol.apy,
    inflation: SOL_INFLATION,
  };

  const engine = useMemo<EngineResult>(() => {
    // BTC Live + 200WMA: Binance (ticker + 200 týždenných sviečok).
    const btcPrice = bn?.price ?? market?.btc?.price ?? 0;
    const btcWma = bn?.sma200w ?? market?.btc?.ma200w ?? 0;
    const btcWmaStale = bn ? false : market?.btc?.ma200wStale === true;
    // BTC-ONLY 200WMA: rovnaká platná vzdialenosť ako v hornom riadku DCA.
    let btcWmaDist: number | null = null;
    if (!btcWmaStale && btcPrice > 0 && btcWma > 0) {
      const dev = ((btcPrice - btcWma) / btcWma) * 100;
      if (Number.isFinite(dev)) btcWmaDist = dev;
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
      ethRyi,
      solRyi,
      confluenceScore,
      prevRatioState: ratioStateRef.current,
      smoothing: { halfLifeHours: 36, maxStepPpPerDay: 2.5 },
    });
  }, [fg, market, bn, metrics, ethRyi.apy, solRyi.apy, confluenceScore]);

  // Persist vyhladený stav (mimo renderu) — EMA pokračuje po reloade.
  useEffect(() => {
    ratioStateRef.current = engine.ratioState;
    writeRatioState(engine.ratioState);
  }, [engine.ratioState]);

  const value: MarketContextValue = {
    engine,
    isLoading: fgLoading || mdLoading || mLoading,
    isDegraded: market?.degraded === true,
  };


  return <MarketContext.Provider value={value}>{children}</MarketContext.Provider>;
}

export function useMarketEngine(): MarketContextValue {
  const ctx = useContext(MarketContext);
  if (!ctx) throw new Error('useMarketEngine must be used inside <MarketProvider>');
  return ctx;
}

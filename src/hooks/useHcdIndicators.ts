import { useMemo } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import { useGasPrices } from '@/hooks/useGasPrices';
import { useCyborgMarketData } from '@/hooks/useCyborgTerminalData';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import {
  computeHcdIndicators,
  getQuarterlyRebalanceStatus,
  type HcdIndicators,
  type QuarterlyRebalanceStatus,
} from '@/lib/hcdArchitecture';
import type { Lang } from '@/lib/i18n';

export function useHcdIndicators(lang: Lang) {
  const { data: market } = useMarketData();
  const { data: gas } = useGasPrices();
  const { terminalApys } = useCyborgMarketData();
  const { data: perCoin } = usePerCoinMetrics();

  const indicators = useMemo<HcdIndicators>(() => {
    const ethMetric = perCoin?.find(c => c.coin === 'eth');
    const solMetric = perCoin?.find(c => c.coin === 'sol');
    return computeHcdIndicators({
      ethAtr14d: market?.eth?.atr14d,
      solAtr14d: market?.sol?.atr14d,
      ethVol30d: ethMetric?.volatility30d,
      solVol30d: solMetric?.volatility30d,
      borrowApyPct: terminalApys.usdcBorrow,
      ethGasUsd: gas?.fees.ethSwap,
      solGasUsd: gas?.fees.solSwap,
    });
  }, [market, gas, terminalApys.usdcBorrow, perCoin]);

  const rebalance = useMemo<QuarterlyRebalanceStatus>(
    () => getQuarterlyRebalanceStatus(new Date(), lang),
    [lang],
  );

  return { indicators, rebalance };
}

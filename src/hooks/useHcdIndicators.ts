import { useMemo } from 'react';
import { useMarketData } from '@/hooks/useMarketData';
import { useGasPrices } from '@/hooks/useGasPrices';
import { useCyborgMarketData } from '@/hooks/useCyborgTerminalData';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import {
  computeHcdIndicators,
  DEFAULT_HCD_INDICATORS,
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
    try {
      const ethMetric = perCoin?.eth;
      const solMetric = perCoin?.sol;
      return computeHcdIndicators({
        ethAtr14d: market?.eth?.atr14d ?? null,
        solAtr14d: market?.sol?.atr14d ?? null,
        ethVol30d: ethMetric?.volatility30d ?? null,
        solVol30d: solMetric?.volatility30d ?? null,
        borrowApyPct: terminalApys?.usdcBorrow ?? 0,
        ethGasUsd: gas?.fees?.ethSwap ?? null,
        solGasUsd: gas?.fees?.solSwap ?? null,
      });
    } catch {
      return DEFAULT_HCD_INDICATORS;
    }
  }, [market, gas, terminalApys?.usdcBorrow, perCoin]);

  const rebalance = useMemo<QuarterlyRebalanceStatus>(
    () => getQuarterlyRebalanceStatus(new Date(), lang),
    [lang],
  );

  return { indicators, rebalance };
}

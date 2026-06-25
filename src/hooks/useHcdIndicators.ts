import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useMarketData } from '@/hooks/useMarketData';
import { useGasPrices } from '@/hooks/useGasPrices';
import { usePerCoinMetrics } from '@/hooks/usePerCoinMetrics';
import { fetchHcdIndicators } from '@/lib/fetchHcdIndicators';
import {
  computeHcdIndicators,
  DEFAULT_HCD_INDICATORS,
  getQuarterlyRebalanceStatus,
  type HcdIndicators,
  type QuarterlyRebalanceStatus,
} from '@/lib/hcdArchitecture';
import type { Lang } from '@/lib/i18n';

const BORROW_STALE_MS = 5 * 60 * 1000;

export function useHcdIndicators(lang: Lang) {
  const { data: market } = useMarketData();
  const { data: gas } = useGasPrices();
  const { data: perCoin } = usePerCoinMetrics();

  const {
    data: borrowRates,
    isLoading: borrowLoading,
    isFetching: borrowFetching,
    isError: borrowError,
  } = useQuery({
    queryKey: ['hcd-live-indicators'],
    queryFn: fetchHcdIndicators,
    staleTime: BORROW_STALE_MS,
    gcTime: BORROW_STALE_MS * 2,
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const liveBorrowApy = borrowRates?.avgBorrowPct ?? 0;

  const indicators = useMemo<HcdIndicators>(() => {
    try {
      const ethMetric = perCoin?.eth;
      const solMetric = perCoin?.sol;
      return computeHcdIndicators({
        ethAtr14d: market?.eth?.atr14d ?? null,
        solAtr14d: market?.sol?.atr14d ?? null,
        ethVol30d: ethMetric?.volatility30d ?? null,
        solVol30d: solMetric?.volatility30d ?? null,
        borrowApyPct: liveBorrowApy,
        ethGasUsd: gas?.fees?.ethSwap ?? null,
        solGasUsd: gas?.fees?.solSwap ?? null,
      });
    } catch {
      return DEFAULT_HCD_INDICATORS;
    }
  }, [market, gas, liveBorrowApy, perCoin]);

  const rebalance = useMemo<QuarterlyRebalanceStatus>(
    () => getQuarterlyRebalanceStatus(new Date(), lang),
    [lang],
  );

  return {
    indicators,
    rebalance,
    borrowLoading: borrowLoading || borrowFetching,
    borrowError,
    borrowRates,
  };
}

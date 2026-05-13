import { useEffect, useMemo } from 'react';
import { useSparklines } from './usePrices';
import { computeAllDynamicLimits, setDynamicLimitsCache, DynamicLimitInfo } from '@/lib/dynamicLimits';

/**
 * Hook ktorý počíta dynamické limit zľavy z 7-dňových sparkline dát
 * a publikuje ich do globálnej cache, aby ich mohli čítať aj non-React funkcie
 * (calculateDCA, profitTaking, atď.).
 */
export function useDynamicLimits(): Record<string, DynamicLimitInfo> {
  const { data: sparklines } = useSparklines();

  const limits = useMemo(() => computeAllDynamicLimits(sparklines), [sparklines]);

  useEffect(() => {
    setDynamicLimitsCache(limits);
  }, [limits]);

  return limits;
}

import { useQuery } from '@tanstack/react-query';
import { readOracle, type OracleMetric } from '@/lib/oracleRegistry';

/** Averaged multi-source oracle value with cache/baseline fail-safe. */
export function useOracle(metric: OracleMetric) {
  return useQuery({
    queryKey: ['oracle-registry', metric],
    queryFn: () => readOracle(metric),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
    retry: 0,
  });
}

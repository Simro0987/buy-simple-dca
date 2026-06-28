import { useQuery } from '@tanstack/react-query';
import {
  fetchPortfolioPerformanceHistory,
  type PortfolioHoldingsMap,
  type PortfolioPerformanceRange,
} from '@/lib/portfolioPerformanceHistory';

export function usePortfolioPerformanceHistory(
  holdings: PortfolioHoldingsMap,
  days: PortfolioPerformanceRange,
) {
  const totalHoldings = holdings.bitcoin + holdings.ethereum + holdings.solana;

  return useQuery({
    queryKey: [
      'portfolio-performance-history',
      days,
      holdings.bitcoin,
      holdings.ethereum,
      holdings.solana,
    ],
    queryFn: () => fetchPortfolioPerformanceHistory(holdings, days),
    enabled: totalHoldings > 0,
    staleTime: 10 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    retry: 1,
  });
}

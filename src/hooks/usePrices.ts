import { useQuery } from '@tanstack/react-query';
import { fetchPrices, fetchFearGreed } from '@/lib/crypto';

export function usePrices() {
  return useQuery({
    queryKey: ['crypto-prices'],
    queryFn: fetchPrices,
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

export function useFearGreed() {
  return useQuery({
    queryKey: ['fear-greed'],
    queryFn: fetchFearGreed,
    refetchInterval: 300000,
    staleTime: 120000,
  });
}

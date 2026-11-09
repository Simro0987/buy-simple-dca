import { useQuery } from '@tanstack/react-query';
import { oracleValue } from '@/lib/oracleRegistry';

/** Live EUR→USD rate from the shared averaged oracle (Binance · Coinbase · CoinGecko). */
export function useEurUsd() {
  return useQuery({
    queryKey: ['eur-usd-rate'],
    staleTime: 10 * 60 * 1000,
    refetchInterval: 60 * 60 * 1000,
    queryFn: async (): Promise<number> => {
      const v = await oracleValue('eurUsd');
      if (v && v > 0.5 && v < 2) return v;
      throw new Error('EUR rate unavailable');
    },
  });
}

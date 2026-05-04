import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface GasPrices {
  ethPriceUsd: number;
  btcPriceUsd: number;
  solPriceUsd: number;
  fees: {
    btcSend: number;
    ethSwap: number;
    ethBridgeArb: number;
    arbSwap: number;
    arbDeposit: number;
    solSwap: number;
    solDeposit: number;
  };
  source: 'live' | 'fallback';
}

const FALLBACK: GasPrices = {
  ethPriceUsd: 3500,
  btcPriceUsd: 95000,
  solPriceUsd: 200,
  fees: {
    btcSend: 2.0,
    ethSwap: 4.5,
    ethBridgeArb: 3.0,
    arbSwap: 0.20,
    arbDeposit: 0.25,
    solSwap: 0.002,
    solDeposit: 0.003,
  },
  source: 'fallback',
};

export function useGasPrices() {
  return useQuery<GasPrices>({
    queryKey: ['gas-prices'],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('gas-prices');
      if (error) throw error;
      return data as GasPrices;
    },
    refetchInterval: 60_000,
    staleTime: 45_000,
    placeholderData: FALLBACK,
  });
}

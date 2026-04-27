import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface AppSettings {
  id: string;
  pin_hash: string | null;
  btc_address: string | null;
  eth_address: string | null;
  eth_arb_address: string | null;
  sol_address: string | null;
  sol_arb_address: string | null;
  wsteth_contract: string;
  jitosol_contract: string;
  etherscan_api_key: string | null;
  arbiscan_api_key: string | null;
  helius_api_key: string | null;
  dca_frequency: string;
  dca_day: string;
  default_amount: number;
  total_capital: number;
  dca_horizon_weeks: number;
  rebalance_threshold: number;
  theme: string;
  telegram_token: string | null;
  telegram_chat_id: string | null;
  staking_config: any;
  score_base_allocations: any;
  regime_multipliers: any;
}

export function useAppSettings() {
  return useQuery({
    queryKey: ['app_settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as AppSettings | null;
    },
    staleTime: 30_000,
  });
}

export function useUpdateAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<AppSettings> & { id: string }) => {
      const { id, ...rest } = patch;
      const { error } = await supabase
        .from('app_settings')
        .update(rest as any)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['app_settings'] }),
  });
}

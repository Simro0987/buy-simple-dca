import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface EngineParams {
  id: number;
  base_market_high: number;
  base_market_low: number;
  base_distance_low: number;
  base_distance_high: number;
  weight_flush: number;
  weight_trend: number;
  weight_sentiment: number;
  weight_onchain: number;
  weight_risk: number;
  volatility_sensitivity: number;
  momentum_sensitivity: number;
  iteration: number;
  last_reward: number | null;
  last_change_log: Array<{ param: string; from: number; to: number; reason: string }>;
  enabled: boolean;
  max_step_pct: number;
  updated_at: string;
}

export interface LearningOutcome {
  id: string;
  week_number: number;
  evaluated_at: string;
  params_snapshot: Record<string, number>;
  per_coin_results: Record<string, { avg_buy: number; price_after_7d: number; fill_rate: number; price_delta_pct: number }>;
  avg_price_delta_7d: number | null;
  avg_fill_rate: number | null;
  reward_score: number | null;
  notes: string | null;
}

export function useEngineParams() {
  return useQuery({
    queryKey: ['engine-params'],
    queryFn: async (): Promise<EngineParams | null> => {
      const { data, error } = await supabase
        .from('engine_params')
        .select('*')
        .eq('id', 1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as EngineParams | null;
    },
    staleTime: 30_000,
  });
}

export function useLearningOutcomes(limit = 10) {
  return useQuery({
    queryKey: ['learning-outcomes', limit],
    queryFn: async (): Promise<LearningOutcome[]> => {
      const { data, error } = await supabase
        .from('learning_outcomes')
        .select('*')
        .order('week_number', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as unknown as LearningOutcome[];
    },
    staleTime: 30_000,
  });
}

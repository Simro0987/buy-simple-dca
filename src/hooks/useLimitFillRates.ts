import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FillRates } from '@/lib/dynamicExecution';

/**
 * Historický fill-rate limit objednávok za posledných ~6 týždňov.
 * fill = FILLED / (FILLED + EXPIRED + CANCELLED).
 * Default 0.5 ak nie sú dáta (neutrálny feedback).
 */
export function useLimitFillRates() {
  return useQuery<FillRates>({
    queryKey: ['limit-fill-rates'],
    queryFn: async () => {
      const since = new Date(Date.now() - 6 * 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('dca_executions')
        .select('coin, status, created_at')
        .eq('kind', 'limit')
        .gte('created_at', since);
      if (error) throw error;

      const calc = (coin: 'ETH' | 'SOL') => {
        const rows = (data ?? []).filter((r: any) => r.coin === coin);
        let filled = 0;
        let closed = 0;
        for (const r of rows as any[]) {
          if (r.status === 'FILLED') { filled++; closed++; }
          else if (r.status === 'EXPIRED' || r.status === 'CANCELLED') closed++;
        }
        if (closed === 0) return 0.5; // neutrálny default
        return Math.max(0, Math.min(1, filled / closed));
      };

      return { eth: calc('ETH'), sol: calc('SOL') };
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

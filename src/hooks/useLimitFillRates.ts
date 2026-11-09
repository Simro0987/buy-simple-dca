import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FillRates } from '@/lib/dynamicExecution';

/**
 * Self-learning fill-rate pre ETH a SOL.
 *
 * Primárny zdroj: `weekly_fill_snapshots` — týždenné snapshoty ukladané pondelňajším
 * cronom (`weekly-fill-snapshot`). Priemerujeme posledných 6 snapshotov per coin.
 * Fallback: live agregácia z `dca_executions` za posledných 6 týždňov
 * (kým nie sú k dispozícii žiadne snapshoty).
 *
 * Default 0.5 (neutrálny feedback loop).
 */
export function useLimitFillRates() {
  return useQuery<FillRates>({
    queryKey: ['limit-fill-rates'],
    queryFn: async () => {
      // 1) Skús prečítať týždenné snapshoty (posledných 6 per coin)
      const { data: snaps } = await supabase
        .from('weekly_fill_snapshots')
        .select('coin, fill_rate, total_closed, week_number')
        .in('coin', ['ETH', 'SOL'])
        .order('week_number', { ascending: false })
        .limit(12);

      const avgFromSnaps = (coin: 'ETH' | 'SOL'): number | null => {
        const rows = (snaps ?? []).filter((r: any) => r.coin === coin).slice(0, 6);
        if (rows.length === 0) return null;
        // Vážený priemer podľa počtu uzavretých objednávok (väčšie týždne = väčšia váha)
        let num = 0, den = 0;
        for (const r of rows as any[]) {
          const w = Math.max(1, Number(r.total_closed) || 0);
          num += Number(r.fill_rate) * w;
          den += w;
        }
        return den > 0 ? num / den : null;
      };

      let eth = avgFromSnaps('ETH');
      let sol = avgFromSnaps('SOL');

      // 2) Fallback na live výpočet z dca_executions (kým neexistujú snapshoty)
      if (eth == null || sol == null) {
        const since = new Date(Date.now() - 6 * 7 * 24 * 60 * 60 * 1000).toISOString();
        const { data } = await supabase
          .from('dca_executions')
          .select('coin, status, created_at')
          .eq('kind', 'limit')
          .gte('created_at', since);

        const calcLive = (coin: 'ETH' | 'SOL') => {
          const rows = (data ?? []).filter((r: any) => r.coin === coin);
          let filled = 0, closed = 0;
          for (const r of rows as any[]) {
            if (r.status === 'FILLED') { filled++; closed++; }
            else if (r.status === 'EXPIRED' || r.status === 'CANCELLED') closed++;
          }
          return closed === 0 ? 0.5 : filled / closed;
        };
        if (eth == null) eth = calcLive('ETH');
        if (sol == null) sol = calcLive('SOL');
      }

      return {
        eth: Math.max(0, Math.min(1, eth)),
        sol: Math.max(0, Math.min(1, sol)),
      };
    },
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });
}

import { useQuery } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';

interface Props { lang: Lang; }

interface Reward {
  month: string;
  total_usd: number;
  btc_reward: number;
  eth_reward: number;
  sol_reward: number;
}

export function YieldEarnedCard({ lang }: Props) {
  const sk = lang === 'sk';
  const { blendedApy, totalStakedValue } = usePortfolio();

  const { data: rewards } = useQuery({
    queryKey: ['staking-rewards-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('staking_rewards')
        .select('month, total_usd, btc_reward, eth_reward, sol_reward')
        .order('month', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Reward[];
    },
    staleTime: 5 * 60_000,
  });

  const totalEarned = (rewards ?? []).reduce((s, r) => s + Number(r.total_usd || 0), 0);
  const last30 = (rewards ?? []).slice(0, 1).reduce((s, r) => s + Number(r.total_usd || 0), 0);
  const projectedAnnual = totalStakedValue * (blendedApy / 100);

  return (
    <div className="glass-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-gain" />
          <span className="text-sm font-semibold text-foreground">
            {sk ? 'Yield zarobený' : 'Yield earned'}
          </span>
        </div>
        <span className="text-[10px] text-muted-foreground">~{blendedApy.toFixed(1)}% APY</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-secondary/40 rounded-md p-2">
          <p className="text-[9px] uppercase text-muted-foreground">{sk ? 'Doteraz' : 'To date'}</p>
          <p className="text-sm font-bold text-gain tabular-nums">{formatUsd(totalEarned)}</p>
        </div>
        <div className="bg-secondary/40 rounded-md p-2">
          <p className="text-[9px] uppercase text-muted-foreground">{sk ? 'Posl. mesiac' : 'Last month'}</p>
          <p className="text-sm font-bold text-foreground tabular-nums">{formatUsd(last30)}</p>
        </div>
        <div className="bg-secondary/40 rounded-md p-2">
          <p className="text-[9px] uppercase text-muted-foreground">{sk ? 'Projekcia/rok' : 'Projected/yr'}</p>
          <p className="text-sm font-bold text-foreground tabular-nums">{formatUsd(projectedAnnual)}</p>
        </div>
      </div>

      {(!rewards || rewards.length === 0) && (
        <p className="text-[10px] text-center text-muted-foreground">
          {sk ? 'Zatiaľ žiadne zaznamenané odmeny.' : 'No recorded rewards yet.'}
        </p>
      )}
    </div>
  );
}

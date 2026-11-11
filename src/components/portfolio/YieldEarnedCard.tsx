import { useQuery } from '@tanstack/react-query';
import { Coins } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { formatUsd } from '@/lib/crypto';
import { Lang } from '@/lib/i18n';
import { BentoCard, BentoStat } from '@/components/portfolio/ui/BentoCard';

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
    <BentoCard padding="md" className="space-y-3 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Coins className="w-4 h-4 text-neon-green" />
          <span className="text-sm font-semibold text-white">
            {sk ? 'Yield zarobený' : 'Yield earned'}
          </span>
        </div>
        <span className="text-[10px] text-white/35 font-mono">~{blendedApy.toFixed(1)}% APY</span>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <BentoStat label={sk ? 'Doteraz' : 'To date'} value={formatUsd(totalEarned)} valueClassName="text-sm text-neon-green" />
        <BentoStat label={sk ? 'Posl. mesiac' : 'Last month'} value={formatUsd(last30)} valueClassName="text-sm" />
        <BentoStat label={sk ? 'Projekcia' : 'Projected'} value={formatUsd(projectedAnnual)} valueClassName="text-sm" />
      </div>

      <p className="text-[10px] text-white/30 text-center">
        {sk
          ? 'Historické staking rewards z databázy · všetky sumy v USD.'
          : 'Historical staking rewards from database · all amounts in USD.'}
      </p>
    </BentoCard>
  );
}

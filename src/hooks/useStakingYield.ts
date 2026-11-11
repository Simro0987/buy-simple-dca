/**
 * useStakingYield — rozklad nerealizovaného PnL na „Price Action“ vs „Staking Yield“.
 *
 * Staking yield = súčet historických staking rewards (množstvo tokenov) z tabuľky
 * `staking_rewards`, prepočítaný aktuálnou cenou. Zvyšok PnL je rast trhovej ceny.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type YieldQtyMap = Record<string, number>;

export function useStakingYieldQty() {
  const { session } = useAuth();
  const userId = session?.user?.id;

  return useQuery<YieldQtyMap>({
    queryKey: ['stakingYieldQty', userId ?? null],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const out: YieldQtyMap = {};
      const { data, error } = await supabase
        .from('staking_rewards')
        .select('btc_reward,eth_reward,sol_reward');
      if (error) return out;
      for (const r of data ?? []) {
        out.BTC = (out.BTC ?? 0) + (Number(r.btc_reward) || 0);
        out.ETH = (out.ETH ?? 0) + (Number(r.eth_reward) || 0);
        out.SOL = (out.SOL ?? 0) + (Number(r.sol_reward) || 0);
      }
      return out;
    },
  });
}

/** Rozdelí nerealizované PnL na cenový pohyb a staking výnos. */
export function splitPnl(totalPnlUsd: number, yieldUsd: number) {
  const y = Math.max(0, Math.min(Math.max(totalPnlUsd, 0), yieldUsd));
  return { priceActionUsd: totalPnlUsd - y, yieldUsd: y };
}

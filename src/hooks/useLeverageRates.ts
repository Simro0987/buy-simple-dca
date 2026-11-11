// ============================================================================
// Live rates pre Vrstvu 3 (Smart Leverage):
//   - Lido (wstETH/stETH) staking APY
//   - Rocket Pool (rETH) staking APY
//   - Aave v3 WETH variable borrow APY na L2 (Arbitrum / Base) — vyberá lacnejší
// 100 % free: DefiLlama /pools, TTL cache, stale-if-error.
// ============================================================================

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { cached, safeJson, TTL } from '@/lib/freeCache';
import { toast } from '@/hooks/use-toast';

export type L2Chain = 'Arbitrum' | 'Base';

export interface LeverageRates {
  lidoApy: number | null;
  rocketApy: number | null;
  borrowApy: number | null;
  /** L2, na ktorej je WETH borrow najlacnejší */
  borrowChain: L2Chain | null;
  source: 'live' | 'partial';
}

interface LlamaPool {
  project?: string;
  chain?: string;
  symbol?: string;
  apy?: number;
  apyBase?: number;
  apyBaseBorrow?: number;
}

async function fetchPools(): Promise<LlamaPool[] | null> {
  const res = await safeJson<{ data?: LlamaPool[] }>('https://yields.llama.fi/pools', 9000);
  const pools = res?.data;
  return Array.isArray(pools) && pools.length ? pools : null;
}

function num(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function fetchLeverageRates(): Promise<LeverageRates> {
  const pools = await cached('llama-pools-leverage-v1', TTL.llama, fetchPools);
  if (!pools) {
    return { lidoApy: null, rocketApy: null, borrowApy: null, borrowChain: null, source: 'partial' };
  }

  const lido = pools.find(p =>
    p.project === 'lido' && p.chain === 'Ethereum' && /steth/i.test(p.symbol ?? ''));
  const rocket = pools.find(p =>
    p.project === 'rocket-pool' && p.chain === 'Ethereum' && /reth/i.test(p.symbol ?? ''));

  const borrowFor = (chain: L2Chain): number | null => {
    const p = pools.find(x =>
      x.project === 'aave-v3' && x.chain === chain && /^weth$/i.test((x.symbol ?? '').trim()));
    return num(p?.apyBaseBorrow);
  };

  const arb = borrowFor('Arbitrum');
  const base = borrowFor('Base');

  let borrowApy: number | null = null;
  let borrowChain: L2Chain | null = null;
  if (arb != null && base != null) {
    borrowChain = arb <= base ? 'Arbitrum' : 'Base';
    borrowApy = Math.min(arb, base);
  } else if (arb != null) { borrowApy = arb; borrowChain = 'Arbitrum'; }
  else if (base != null) { borrowApy = base; borrowChain = 'Base'; }

  const lidoApy = num(lido?.apyBase ?? lido?.apy);
  const rocketApy = num(rocket?.apyBase ?? rocket?.apy);
  const complete = lidoApy != null && rocketApy != null && borrowApy != null;

  return { lidoApy, rocketApy, borrowApy, borrowChain, source: complete ? 'live' : 'partial' };
}

export function useLeverageRates() {
  const q = useQuery<LeverageRates>({
    queryKey: ['leverage-rates-live-v1'],
    queryFn: fetchLeverageRates,
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
    retry: 1,
  });

  const incomplete = q.isError || (!!q.data && q.data.source === 'partial');
  useEffect(() => {
    if (!incomplete || q.isFetching) return;
    toast({
      title: 'Live sadzby nedostupné',
      description: 'DefiLlama neodpovedala — chýbajúce hodnoty zobrazujem ako „— %“.',
    });
  }, [incomplete, q.isFetching]);

  return {
    loading: q.isLoading,
    fetching: q.isFetching,
    error: q.isError,
    rates: q.data ?? { lidoApy: null, rocketApy: null, borrowApy: null, borrowChain: null, source: 'partial' as const },
  };
}

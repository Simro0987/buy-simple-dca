import { useQuery } from '@tanstack/react-query';
import { solanaRpc } from '@/lib/api/dataProxy';

// Live staking yield hooks with static fallbacks.
// SOL → Solana RPC via our data-proxy (inflation based), ETH → Lido stETH APR (SMA).

export const SOL_APY_FALLBACK = 4.5;
export const LIDO_APR_FALLBACK = 3.1;


// Share of circulating supply that is staked — used to convert network
// inflation into a per-staker APY. Conservative long-run average.
const STAKE_RATIO = 0.65;

const TIMEOUT_MS = 4000;

export interface SolApyData {
  apy: number;
  source: 'rpc' | 'fallback';
}

/** Live SOL native staking APY (Solana RPC via data-proxy, static fallback). */
export function useSolStakingApy() {
  return useQuery<SolApyData>({
    queryKey: ['sol-staking-apy'],
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    queryFn: async () => {
      const result = await solanaRpc<{ validator?: number }>('getInflationRate', [], TIMEOUT_MS);
      const validator = result?.validator;
      if (typeof validator === 'number' && validator > 0) {
        const apy = (validator / STAKE_RATIO) * 100;
        if (apy > 0.5 && apy < 20) return { apy, source: 'rpc' };
      }
      return { apy: SOL_APY_FALLBACK, source: 'fallback' };
    },
  });
}

export interface LidoAprData {
  apr: number;
  source: 'lido' | 'fallback';
}

/** Live Lido stETH APR (7-day SMA) with static fallback. */
export function useLidoApr() {
  return useQuery<LidoAprData>({
    queryKey: ['lido-steth-apr'],
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    queryFn: async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch('https://eth-api.lido.fi/v1/protocol/steth/apr/sma', { signal: ctrl.signal });
        clearTimeout(t);
        if (res.ok) {
          const json = await res.json();
          const apr = json?.data?.smaApr ?? json?.data?.apr ?? json?.smaApr;
          if (typeof apr === 'number' && apr > 0 && apr < 20) return { apr, source: 'lido' };
        }
      } catch { /* fallback */ }
      return { apr: LIDO_APR_FALLBACK, source: 'fallback' };
    },
  });
}

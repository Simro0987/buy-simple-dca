import { useQuery } from '@tanstack/react-query';

// Live staking yield hooks with static fallbacks.
// SOL → Helius RPC (inflation based), ETH → Lido stETH APR (SMA).

export const SOL_APY_FALLBACK = 4.5;
export const LIDO_APR_FALLBACK = 3.1;

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/';
const HELIUS_API = 'https://api.helius.xyz/v0/rpc';
const PUBLIC_SOL_RPC = 'https://api.mainnet-beta.solana.com';

// Share of circulating supply that is staked — used to convert network
// inflation into a per-staker APY. Conservative long-run average.
const STAKE_RATIO = 0.65;

const TIMEOUT_MS = 4000;

async function postRpc(url: string, method: string): Promise<unknown | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: [] }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const json = await res.json();
    return json?.result ?? null;
  } catch {
    return null;
  }
}

export interface SolApyData {
  apy: number;
  source: 'helius' | 'rpc' | 'fallback';
}

/** Live SOL native staking APY (Helius RPC, public RPC fallback, static fallback). */
export function useSolStakingApy() {
  return useQuery<SolApyData>({
    queryKey: ['sol-staking-apy'],
    staleTime: 10 * 60 * 1000,
    refetchInterval: 15 * 60 * 1000,
    queryFn: async () => {
      const attempts: Array<{ url: string; source: SolApyData['source'] }> = [
        { url: HELIUS_RPC, source: 'helius' },
        { url: HELIUS_API, source: 'helius' },
        { url: PUBLIC_SOL_RPC, source: 'rpc' },
      ];
      for (const a of attempts) {
        const result = await postRpc(a.url, 'getInflationRate');
        const validator = (result as { validator?: number } | null)?.validator;
        if (typeof validator === 'number' && validator > 0) {
          const apy = (validator / STAKE_RATIO) * 100;
          if (apy > 0.5 && apy < 20) return { apy, source: a.source };
        }
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

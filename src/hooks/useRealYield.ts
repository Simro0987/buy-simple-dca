import { useQuery } from '@tanstack/react-query';
import {
  ETH_REAL_YIELD,
  SOL_REAL_YIELD,
  ryiFromApy,
  selectEthStakingApy,
  selectSolStakingApy,
  type LlamaPool,
} from '@/lib/realYieldIndex';

export interface RealYieldData {
  /** Live (or fallback) gross staking APY, %. */
  ethApyPct: number;
  solApyPct: number;
  /** Base network inflation used, %. */
  ethInflationPct: number;
  solInflationPct: number;
  /** RYI = APY − inflation, %. */
  ethRyi: number;
  solRyi: number;
  /** Where the APY came from. */
  source: 'live' | 'fallback';
}

const CACHE_KEY = 'dca-real-yield-v1';
const POOLS_URL = 'https://yields.llama.fi/pools';

const FALLBACK: RealYieldData = {
  ethApyPct: ETH_REAL_YIELD.grossApyPct,
  solApyPct: SOL_REAL_YIELD.grossApyPct,
  ethInflationPct: ETH_REAL_YIELD.inflationPct,
  solInflationPct: SOL_REAL_YIELD.inflationPct,
  ethRyi: ryiFromApy(ETH_REAL_YIELD.grossApyPct, ETH_REAL_YIELD.inflationPct),
  solRyi: ryiFromApy(SOL_REAL_YIELD.grossApyPct, SOL_REAL_YIELD.inflationPct),
  source: 'fallback',
};

function readCache(): RealYieldData | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as RealYieldData) : null;
  } catch {
    return null;
  }
}

async function fetchRealYield(): Promise<RealYieldData> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12_000);
    let json: { data?: LlamaPool[] };
    try {
      const res = await fetch(POOLS_URL, { signal: ctrl.signal });
      if (!res.ok) throw new Error(`DefiLlama pools ${res.status}`);
      json = (await res.json()) as { data?: LlamaPool[] };
    } finally {
      clearTimeout(timer);
    }

    const pools = json?.data ?? [];
    const ethApy = selectEthStakingApy(pools);
    const solApy = selectSolStakingApy(pools);

    // If neither canonical pool resolved, treat as a failed fetch.
    if (ethApy === null && solApy === null) throw new Error('no staking pools matched');

    const ethApyPct = ethApy ?? ETH_REAL_YIELD.grossApyPct;
    const solApyPct = solApy ?? SOL_REAL_YIELD.grossApyPct;

    const data: RealYieldData = {
      ethApyPct,
      solApyPct,
      ethInflationPct: ETH_REAL_YIELD.inflationPct,
      solInflationPct: SOL_REAL_YIELD.inflationPct,
      ethRyi: ryiFromApy(ethApyPct, ETH_REAL_YIELD.inflationPct),
      solRyi: ryiFromApy(solApyPct, SOL_REAL_YIELD.inflationPct),
      // "live" only when BOTH legs came from the API.
      source: ethApy !== null && solApy !== null ? 'live' : 'fallback',
    };

    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(data));
    } catch {
      /* quota — ignore */
    }
    return data;
  } catch {
    // Safe fallback: last good cache, else static constants — never break the app.
    const cached = readCache();
    return cached ? { ...cached, source: 'fallback' } : FALLBACK;
  }
}

/**
 * Live Real Yield Index (RYI) inputs for the Satellite Staking Booster.
 * Fetches staking APY from DefiLlama (free, no key), combines with a hardcoded
 * base inflation rate, and falls back to safe constants on any failure.
 */
export function useRealYield() {
  return useQuery<RealYieldData>({
    queryKey: ['dca-real-yield-v1'],
    queryFn: fetchRealYield,
    initialData: () => readCache() ?? FALLBACK,
    staleTime: 30 * 60 * 1000, // 30 min
    refetchInterval: 60 * 60 * 1000, // hourly
    refetchOnWindowFocus: false,
    retry: 1,
  });
}

import type { YieldRoute } from '@/hooks/useYieldScanner';

export interface LlamaPool {
  pool?: string;
  project: string;
  chain: string;
  symbol: string;
  apy: number | null;
  apyBase?: number | null;
  apyBaseBorrow?: number | null;
  tvlUsd?: number | null;
}

const protocols: Record<string, string> = {
  'aave-v3': 'Aave V3', 'morpho-blue': 'Morpho',
  'morpho-aave': 'Morpho', 'morpho-aavev3': 'Morpho',
  'sparklend': 'Spark', 'compound-v3': 'Compound V3', 'sky-lending': 'Maker / Sky',
};
const chainAlias: Record<string, string> = { 'OP Mainnet': 'Optimism', xDai: 'Gnosis' };

export function parseYieldRoutes(pools: LlamaPool[]): YieldRoute[] {
  return pools.flatMap(p => {
    const protocol = protocols[p.project];
    const supply = p.apy ?? p.apyBase;
    const tvl = p.tvlUsd;
    if (!protocol || !p.chain || !p.symbol || p.symbol.includes('-') ||
        typeof supply !== 'number' || !Number.isFinite(supply) || supply < 0 || supply > 100 ||
        typeof tvl !== 'number' || !Number.isFinite(tvl) || tvl < 1_000_000) return [];
    return [{ protocol, chain: chainAlias[p.chain] ?? p.chain, symbol: p.symbol, supplyApy: supply,
      borrowApy: typeof p.apyBaseBorrow === 'number' && Number.isFinite(p.apyBaseBorrow) ? p.apyBaseBorrow : null,
      tvlUsd: tvl }];
  });
}
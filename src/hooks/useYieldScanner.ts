/**
 * useYieldScanner — LIVE APY/borrow-rate scanner built on the free DefiLlama
 * yields API (https://yields.llama.fi/pools). Scans Aave V3 and Morpho pools
 * across L2s and returns the best supply APY plus borrow cost estimates.
 */
import { useQuery } from '@tanstack/react-query';
import { parseYieldRoutes, type LlamaPool } from '@/lib/yieldScanner';

export interface YieldRoute {
  protocol: string;      // "Aave V3" | "Morpho"
  chain: string;         // "Arbitrum" | "Base" | "Ethereum" ...
  symbol: string;        // collateral symbol
  supplyApy: number;     // %
  borrowApy: number | null; // % (null when DefiLlama has no borrow leg)
  tvlUsd: number;
}

export interface YieldScanResult {
  routes: YieldRoute[];
  bestBtcRoute: YieldRoute | null;   // cbBTC / WBTC collateral
  bestEthRoute: YieldRoute | null;   // wstETH / WETH collateral
  bestStableBorrow: YieldRoute | null;
  scannedPools: number;
  updatedAt: number;
}

const BTC_SYMBOLS = ['CBBTC', 'WBTC', 'TBTC', 'LBTC'];
const ETH_SYMBOLS = ['WSTETH', 'WETH', 'ETH', 'RETH', 'WEETH'];
const STABLE_SYMBOLS = ['USDC', 'USDT', 'DAI'];

function pickBest(routes: YieldRoute[], symbols: string[]): YieldRoute | null {
  const matches = routes.filter(r => symbols.includes(r.symbol.toUpperCase()));
  if (matches.length === 0) return null;
  return matches.reduce((a, b) => (b.tvlUsd > a.tvlUsd ? b : a));
}

async function fetchYieldScan(): Promise<YieldScanResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    const res = await fetch('https://yields.llama.fi/pools', { signal: ctrl.signal });
    if (!res.ok) throw new Error(`DefiLlama status ${res.status}`);
    const json = await res.json();
    if (!Array.isArray(json?.data)) throw new Error('DefiLlama: dáta nedostupné');
    // Borrow rates live on /lendBorrow; merge them by pool id (best effort).
    let borrow = new Map<string, number>();
    try {
      const lb = await fetch('https://yields.llama.fi/lendBorrow', { signal: ctrl.signal });
      if (lb.ok) {
        const arr = await lb.json();
        if (Array.isArray(arr)) borrow = new Map(arr.filter((x: any) => typeof x?.apyBaseBorrow === 'number').map((x: any) => [x.pool, x.apyBaseBorrow]));
      }
    } catch { /* supply-only scan */ }
    const pools = (json.data as LlamaPool[]).map(p => (p.pool && borrow.has(p.pool) ? { ...p, apyBaseBorrow: borrow.get(p.pool) } : p));
    const routes = parseYieldRoutes(pools);
    if (!routes.length) throw new Error('DefiLlama: výnosy nedostupné');

    return {
      routes,
      bestBtcRoute: pickBest(routes, BTC_SYMBOLS),
      bestEthRoute: pickBest(routes, ETH_SYMBOLS),
      bestStableBorrow: pickBest(routes, STABLE_SYMBOLS),
      scannedPools: routes.length,
      updatedAt: Date.now(),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function useYieldScanner() {
  return useQuery({
    queryKey: ['yield-scanner-v1'],
    queryFn: fetchYieldScan,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    retry: 2,
    retryDelay: (a) => Math.min(3000 * 2 ** a, 20_000),
  });
}

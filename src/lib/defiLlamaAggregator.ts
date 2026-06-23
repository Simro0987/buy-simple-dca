/**
 * Consolidated DefiLlama data layer.
 * All protocol APY/yield lookups go through a single yields pool fetch.
 * Prices use coins.llama.fi (one request).
 *
 * APY convention: DefiLlama yields.llama.fi returns ready-to-use percent (7.5 = 7.5%).
 * Never multiply by 100 in fetch/display paths.
 */

export const DATA_UNAVAILABLE = 'Data unavailable';
export const LBTC_APY_FALLBACK = 7.5;
export const MAX_DISPLAY_APY = 50;

export interface LlamaPool {
  pool: string;
  project: string;
  symbol: string;
  chain: string;
  apy: number;
  apyBaseBorrow?: number;
}

export interface DefiLlamaYields {
  rocketPool: number | null;
  etherFi: number | null;
  marinade: number | null;
  sanctumInf: number | null;
  kaminoApy: number | null;
  lbtcApy: number | null;
  usdcBorrowApy: number | null;
  unavailable: string[];
}

export interface DefiLlamaPrices {
  btc: number;
  eth: number;
  sol: number;
  lbtcPriceUsd: number | null;
}

/** DefiLlama APY is percent (7.5 = 7.5%). Normalize decimal outliers only. */
export function normalizeApyPercent(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null;
  let apy = raw;
  if (apy > 0 && apy < 1) apy *= 100;
  if (apy > 500) apy /= 100;
  if (apy > 500) return null;
  return apy;
}

export function capDisplayApy(apy: number | null | undefined): number | null {
  const n = normalizeApyPercent(apy);
  if (n == null) return null;
  return Math.min(n, MAX_DISPLAY_APY);
}

export function formatDisplayApy(apy: number | null | undefined): string {
  const capped = capDisplayApy(apy);
  return capped != null ? `${capped.toFixed(2)}%` : DATA_UNAVAILABLE;
}

function pickBestPool(
  pools: LlamaPool[],
  filter: (p: LlamaPool) => boolean,
  apyField: 'apy' | 'apyBaseBorrow' = 'apy',
  maxApy = MAX_DISPLAY_APY,
): number | null {
  let best: number | null = null;
  for (const p of pools) {
    if (!filter(p)) continue;
    const raw = apyField === 'apyBaseBorrow' ? (p.apyBaseBorrow ?? p.apy) : p.apy;
    const val = normalizeApyPercent(raw);
    if (val == null || val > maxApy) continue;
    if (best === null || val > best) best = val;
  }
  return best;
}

/** Single call — all protocol yields from DefiLlama pools index. */
export async function fetchLlamaPools(): Promise<LlamaPool[]> {
  const res = await fetch('https://yields.llama.fi/pools');
  if (!res.ok) throw new Error(`DefiLlama yields ${res.status}`);
  const json = await res.json();
  return (json.data ?? []) as LlamaPool[];
}

export interface TerminalExclusiveYields {
  lbtcApy: number | null;
  usdcBorrowApy: number | null;
  unavailable: string[];
}

/** Cyborg-only yields — Morpho USDC borrow + LBTC market supply. No base staking APYs. */
export function extractTerminalExclusiveYields(pools: LlamaPool[]): TerminalExclusiveYields {
  const unavailable: string[] = [];

  let lbtcApy =
    pickBestPool(pools, p => p.project.toLowerCase().includes('lombard'), 'apy', 15) ??
    pickBestPool(pools, p => p.symbol.toUpperCase().includes('LBTC'), 'apy', 15) ??
    pickBestPool(
      pools,
      p =>
        p.project.toLowerCase().includes('morpho') && p.symbol.toUpperCase().includes('LBTC'),
      'apy',
      15,
    );

  if (lbtcApy === null) {
    lbtcApy = LBTC_APY_FALLBACK;
  }

  const usdcBorrowApy =
    pickBestPool(
      pools,
      p =>
        p.project.toLowerCase().includes('morpho') &&
        p.symbol.toUpperCase().includes('USDC'),
      'apyBaseBorrow',
      10,
    ) ??
    pickBestPool(
      pools,
      p =>
        p.project.toLowerCase().includes('morpho') &&
        p.symbol.toUpperCase().includes('USDC'),
      'apy',
      10,
    );
  if (usdcBorrowApy === null) unavailable.push('Morpho');

  return { lbtcApy, usdcBorrowApy, unavailable };
}

export function extractProtocolYields(pools: LlamaPool[]): DefiLlamaYields {
  const unavailable: string[] = [];

  const rocketPool = pickBestPool(
    pools,
    p =>
      p.chain === 'Ethereum' &&
      p.project.toLowerCase() === 'rocket-pool' &&
      p.symbol.toUpperCase().includes('RETH'),
    'apy',
    10,
  ) ?? pickBestPool(
    pools,
    p =>
      p.chain === 'Ethereum' &&
      p.project.toLowerCase().includes('rocket') &&
      p.symbol.toUpperCase().includes('RETH'),
    'apy',
    10,
  );
  if (rocketPool === null) unavailable.push('Rocket Pool');

  const etherFi = pickBestPool(
    pools,
    p =>
      p.chain === 'Ethereum' &&
      (p.project.toLowerCase().includes('ether') || p.symbol.toUpperCase().includes('WEETH')),
  );
  if (etherFi === null) unavailable.push('ether.fi');

  const marinade = pickBestPool(
    pools,
    p =>
      p.chain === 'Solana' &&
      (p.project.toLowerCase().includes('marinade') || p.symbol.toUpperCase().includes('MSOL')),
  );
  if (marinade === null) unavailable.push('Marinade');

  const sanctumInf = pickBestPool(
    pools,
    p =>
      p.chain === 'Solana' &&
      (p.project.toLowerCase().includes('sanctum') || p.symbol.toUpperCase() === 'INF'),
  );
  if (sanctumInf === null) unavailable.push('Sanctum');

  const kaminoApy = pickBestPool(
    pools,
    p => {
      if (p.chain !== 'Solana') return false;
      const project = p.project.toLowerCase();
      if (!project.includes('kamino')) return false;
      const sym = p.symbol.toUpperCase();
      return sym === 'SOL' || sym === 'JITOSOL' || sym === 'MSOL';
    },
  );
  if (kaminoApy === null) unavailable.push('Kamino');

  let lbtcApy =
    pickBestPool(pools, p => p.project.toLowerCase().includes('lombard'), 'apy', 15) ??
    pickBestPool(pools, p => p.symbol.toUpperCase().includes('LBTC'), 'apy', 15) ??
    pickBestPool(
      pools,
      p =>
        p.project.toLowerCase().includes('morpho') && p.symbol.toUpperCase().includes('LBTC'),
      'apy',
      15,
    );

  if (lbtcApy === null) {
    lbtcApy = LBTC_APY_FALLBACK;
  }

  const usdcBorrowApy =
    pickBestPool(
      pools,
      p =>
        p.project.toLowerCase().includes('morpho') &&
        p.symbol.toUpperCase().includes('USDC'),
      'apyBaseBorrow',
      10,
    ) ??
    pickBestPool(
      pools,
      p =>
        p.project.toLowerCase().includes('morpho') &&
        p.symbol.toUpperCase().includes('USDC'),
      'apy',
      10,
    );
  if (usdcBorrowApy === null) unavailable.push('Morpho');

  return {
    rocketPool,
    etherFi,
    marinade,
    sanctumInf,
    kaminoApy,
    lbtcApy,
    usdcBorrowApy,
    unavailable,
  };
}

/** Single call — spot prices via DefiLlama coins API. */
export async function fetchDefiLlamaPrices(): Promise<DefiLlamaPrices> {
  const res = await fetch(
    'https://coins.llama.fi/prices/current/coingecko:bitcoin,coingecko:ethereum,coingecko:solana,coingecko:lombard-staked-btc',
  );
  if (!res.ok) throw new Error(`DefiLlama prices ${res.status}`);
  const json = await res.json();
  const coins = json.coins ?? {};
  const btc = coins['coingecko:bitcoin']?.price ?? 0;
  const eth = coins['coingecko:ethereum']?.price ?? 0;
  const sol = coins['coingecko:solana']?.price ?? 0;
  const lbtc = coins['coingecko:lombard-staked-btc']?.price ?? btc;
  return { btc, eth, sol, lbtcPriceUsd: lbtc || null };
}

/** Optional protocol TVL snapshot — parallel-safe, non-blocking enrichment. */
export async function fetchProtocolTvl(slug: string): Promise<number | null> {
  const res = await fetch(`https://api.llama.fi/tvl/${slug}`);
  if (!res.ok) return null;
  const val = await res.json();
  return typeof val === 'number' && Number.isFinite(val) ? val : null;
}

export const CYBORG_PROTOCOL_SLUGS = [
  'rocket-pool',
  'marinade',
  'kamino',
  'morpho',
  'lombard',
  'ether.fi',
] as const;

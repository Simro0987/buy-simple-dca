/**
 * Consolidated DefiLlama data layer.
 * All protocol APY/yield lookups go through a single yields pool fetch.
 * Prices use coins.llama.fi (one request).
 */

export const DATA_UNAVAILABLE = 'Data unavailable';

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

function pickBestPool(
  pools: LlamaPool[],
  filter: (p: LlamaPool) => boolean,
  apyField: 'apy' | 'apyBaseBorrow' = 'apy',
): number | null {
  let best: number | null = null;
  for (const p of pools) {
    if (!filter(p)) continue;
    const val = apyField === 'apyBaseBorrow' ? (p.apyBaseBorrow ?? p.apy) : p.apy;
    if (Number.isFinite(val) && val > 0 && (best === null || val > best)) best = val;
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

export function extractProtocolYields(pools: LlamaPool[]): DefiLlamaYields {
  const unavailable: string[] = [];

  const rocketPool = pickBestPool(
    pools,
    p =>
      p.chain === 'Ethereum' &&
      (p.project.toLowerCase().includes('rocket') || p.symbol.toUpperCase().includes('RETH')),
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
    p =>
      p.chain === 'Solana' &&
      p.project.toLowerCase().includes('kamino') &&
      (p.symbol.toUpperCase().includes('SOL') || p.symbol.toUpperCase().includes('JITO')),
  );
  if (kaminoApy === null) unavailable.push('Kamino');

  const lbtcApy = pickBestPool(
    pools,
    p =>
      p.chain === 'Arbitrum' &&
      (p.symbol.toUpperCase().includes('LBTC') ||
        p.project.toLowerCase().includes('lombard') ||
        (p.project.toLowerCase().includes('morpho') && p.symbol.toUpperCase().includes('LBTC'))),
  );
  if (lbtcApy === null) unavailable.push('LBTC');

  const usdcBorrowApy =
    pickBestPool(
      pools,
      p =>
        p.chain === 'Arbitrum' &&
        p.project.toLowerCase().includes('morpho') &&
        p.symbol.toUpperCase().includes('USDC'),
      'apyBaseBorrow',
    ) ??
    pickBestPool(
      pools,
      p =>
        p.chain === 'Arbitrum' &&
        p.project.toLowerCase().includes('morpho') &&
        p.symbol.toUpperCase().includes('USDC'),
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

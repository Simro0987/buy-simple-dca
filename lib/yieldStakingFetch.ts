import { DCA_SATELLITE_TOKENS, DCA_YIELD_TOKENS } from "@/lib/dcaMarketData";

interface DefiLlamaPool {
  symbol?: string;
  project?: string;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  chain?: string;
}

const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";

/** Known DeFiLlama project slugs per token for staking / yield pool matching. */
const STAKING_PROJECTS_BY_SYMBOL: Record<string, string[]> = {
  ETH: ["lido", "rocket-pool", "frax-ether", "coinbase-wrapped-staked-eth"],
  SOL: ["marinade-finance", "jito", "solayer", "binance-staked-sol"],
  HYPE: ["hyperliquid"],
  JUP: ["jupiter-staked-sol", "jupiter"],
  AAVE: ["aave-v3", "aave"],
  GMX: ["gmx", "gmx-v2"],
  PENDLE: ["pendle"],
  MORPHO: ["morpho", "morpho-v1", "morpho-blue"],
  LINK: ["chainlink-staking", "ssv-network"],
};

const ALL_YIELD_SYMBOLS = [
  ...DCA_SATELLITE_TOKENS.map((t) => t.symbol),
  ...DCA_YIELD_TOKENS.map((t) => t.symbol),
];

function poolApy(pool: DefiLlamaPool): number {
  if (typeof pool.apy === "number" && pool.apy > 0) return pool.apy;
  const base = pool.apyBase ?? 0;
  const reward = pool.apyReward ?? 0;
  return base + reward;
}

function matchesSymbol(pool: DefiLlamaPool, symbol: string): boolean {
  const poolSymbol = (pool.symbol ?? "").toUpperCase();
  if (poolSymbol === symbol) return true;

  const projects = STAKING_PROJECTS_BY_SYMBOL[symbol] ?? [];
  const project = (pool.project ?? "").toLowerCase();
  return projects.some((slug) => project.includes(slug));
}

function medianTopApys(apys: number[], take = 3): number | null {
  if (apys.length === 0) return null;
  const sorted = [...apys].sort((a, b) => b - a);
  const top = sorted.slice(0, take);
  return top.reduce((sum, value) => sum + value, 0) / top.length;
}

let cachedPools: DefiLlamaPool[] | null = null;
let cacheFetchedAt = 0;
const CACHE_TTL_MS = 5 * 60_000;

async function loadDefiLlamaPools(): Promise<DefiLlamaPool[]> {
  const now = Date.now();
  if (cachedPools && now - cacheFetchedAt < CACHE_TTL_MS) {
    return cachedPools;
  }

  try {
    const res = await fetch(DEFILLAMA_POOLS_URL, { cache: "no-store" });
    if (!res.ok) return cachedPools ?? [];

    const json = (await res.json()) as { data?: DefiLlamaPool[] };
    cachedPools = json.data ?? [];
    cacheFetchedAt = now;
    return cachedPools;
  } catch {
    return cachedPools ?? [];
  }
}

/**
 * Fetch on-chain / protocol staking APY from DeFiLlama yields API.
 * Returns median of top matching pools per symbol.
 */
export async function fetchDefillamaApyMap(
  symbols: string[] = ALL_YIELD_SYMBOLS,
): Promise<Record<string, number>> {
  const pools = await loadDefiLlamaPools();
  if (pools.length === 0) return {};

  const result: Record<string, number> = {};

  for (const symbol of symbols) {
    const matchingApys = pools
      .filter((pool) => matchesSymbol(pool, symbol))
      .map(poolApy)
      .filter((apy) => apy > 0 && apy < 200);

    const median = medianTopApys(matchingApys);
    if (median != null) {
      result[symbol] = Math.round(median * 10) / 10;
    }
  }

  return result;
}

export async function fetchDefillamaApyForSymbol(
  symbol: string,
): Promise<number | null> {
  const map = await fetchDefillamaApyMap([symbol]);
  return map[symbol] ?? null;
}

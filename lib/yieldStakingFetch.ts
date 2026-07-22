import { DCA_SATELLITE_TOKENS, DCA_YIELD_TOKENS } from "@/lib/dcaMarketData";

export interface DefiLlamaPool {
  symbol?: string;
  project?: string;
  apy?: number;
  apyBase?: number;
  apyReward?: number;
  chain?: string;
  tvlUsd?: number;
  ilRisk?: string;
  exposure?: string;
}

const DEFILLAMA_POOLS_URL = "https://yields.llama.fi/pools";

const ALL_YIELD_SYMBOLS = [
  ...DCA_SATELLITE_TOKENS.map((t) => t.symbol),
  ...DCA_YIELD_TOKENS.map((t) => t.symbol),
];

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function poolApy(pool: DefiLlamaPool): number {
  if (typeof pool.apy === "number" && pool.apy >= 0) return pool.apy;
  const base = pool.apyBase ?? 0;
  const reward = pool.apyReward ?? 0;
  return base + reward;
}

/** Exact symbol match — no project-slug guessing. */
export function matchesExactSymbol(pool: DefiLlamaPool, symbol: string): boolean {
  return (pool.symbol ?? "").toUpperCase() === symbol.toUpperCase();
}

/**
 * Single-sided staking only: no IL risk, no LP pair symbols (ETH-USDC, ETH/STETH).
 */
export function isSingleSidedStakingPool(pool: DefiLlamaPool): boolean {
  const symbol = (pool.symbol ?? "").trim();
  if (!symbol) return false;
  if (pool.ilRisk != null && pool.ilRisk !== "no") return false;
  if (/[\/\-]/.test(symbol)) return false;
  if (pool.exposure != null && pool.exposure !== "single") return false;
  return true;
}

/** Pick the highest-TVL eligible pool — never the highest APY. */
export function pickHighestTvlDefillamaPool(
  pools: DefiLlamaPool[],
  symbol: string,
): DefiLlamaPool | null {
  const eligible = pools.filter(
    (pool) =>
      matchesExactSymbol(pool, symbol) &&
      isSingleSidedStakingPool(pool) &&
      (pool.tvlUsd ?? 0) > 0,
  );

  if (eligible.length === 0) return null;

  return eligible.reduce((best, pool) =>
    (pool.tvlUsd ?? 0) > (best.tvlUsd ?? 0) ? pool : best,
  );
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
 * DeFiLlama staking APY per symbol from the highest-TVL single-sided pool.
 * `null` = queried but no eligible pool (show N/A / 0 %, no mock fallback).
 */
export async function fetchDefillamaApyMap(
  symbols: string[] = ALL_YIELD_SYMBOLS,
): Promise<Record<string, number | null>> {
  const pools = await loadDefiLlamaPools();
  const result: Record<string, number | null> = {};

  for (const symbol of symbols) {
    if (pools.length === 0) {
      result[symbol] = null;
      continue;
    }

    const pool = pickHighestTvlDefillamaPool(pools, symbol);
    if (!pool) {
      result[symbol] = null;
      continue;
    }

    const apy = poolApy(pool);
    if (apy < 0 || apy >= 200 || !Number.isFinite(apy)) {
      result[symbol] = null;
      continue;
    }

    result[symbol] = round1(apy);
  }

  return result;
}

export async function fetchDefillamaApyForSymbol(
  symbol: string,
): Promise<number | null> {
  const map = await fetchDefillamaApyMap([symbol]);
  return map[symbol] ?? null;
}

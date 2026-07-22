import { DCA_SATELLITE_TOKENS, DCA_YIELD_TOKENS } from "@/lib/dcaMarketData";
import {
  fetchJupiterGovernanceStakingApy,
  resolveOfficialEthStakingApy,
} from "@/lib/officialStakingSources";

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

let cachedJupGovernanceApy: number | null | undefined;
let jupGovernanceCacheFetchedAt = 0;

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

async function loadJupiterGovernanceApy(): Promise<number | null> {
  const now = Date.now();
  if (
    cachedJupGovernanceApy !== undefined &&
    now - jupGovernanceCacheFetchedAt < CACHE_TTL_MS
  ) {
    return cachedJupGovernanceApy;
  }

  const apy = await fetchJupiterGovernanceStakingApy();
  cachedJupGovernanceApy = apy;
  jupGovernanceCacheFetchedAt = now;
  return apy;
}

function resolveGenericDefillamaApy(
  pools: DefiLlamaPool[],
  symbol: string,
): number | null {
  const pool = pickHighestTvlDefillamaPool(pools, symbol);
  if (!pool) return null;

  const apy = poolApy(pool);
  if (apy < 0 || apy >= 200 || !Number.isFinite(apy)) return null;

  return round1(apy);
}

/**
 * Staking APY per symbol.
 * - ETH → Rocket Pool rETH, fallback Lido stETH (official liquid staking)
 * - JUP → Jupiter governance locker + ASR emission schedule
 * - Others → highest-TVL single-sided DefiLlama pool
 *
 * `null` = queried but no eligible source (UI hides the metric).
 */
export async function fetchDefillamaApyMap(
  symbols: string[] = ALL_YIELD_SYMBOLS,
): Promise<Record<string, number | null>> {
  const needsDefillama = symbols.some(
    (symbol) => symbol !== "JUP" && symbol !== "ETH",
  );
  const needsEth = symbols.includes("ETH");
  const needsJup = symbols.includes("JUP");

  const [pools, jupApy] = await Promise.all([
    needsDefillama || needsEth ? loadDefiLlamaPools() : Promise.resolve([]),
    needsJup ? loadJupiterGovernanceApy() : Promise.resolve(null),
  ]);

  const result: Record<string, number | null> = {};

  for (const symbol of symbols) {
    if (symbol === "JUP") {
      result[symbol] = jupApy;
      continue;
    }

    if (symbol === "ETH") {
      result[symbol] =
        pools.length > 0 ? resolveOfficialEthStakingApy(pools) : null;
      continue;
    }

    if (pools.length === 0) {
      result[symbol] = null;
      continue;
    }

    result[symbol] = resolveGenericDefillamaApy(pools, symbol);
  }

  return result;
}

export async function fetchDefillamaApyForSymbol(
  symbol: string,
): Promise<number | null> {
  const map = await fetchDefillamaApyMap([symbol]);
  return map[symbol] ?? null;
}

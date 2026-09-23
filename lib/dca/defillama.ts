import type { DcaSymbol } from "@/lib/dca/types";

export const YIELD_SYMBOLS: DcaSymbol[] = ["ETH", "SOL", "AAVE", "LINK"];

interface LlamaPool {
  chain?: string;
  project?: string;
  symbol?: string;
  apy?: number;
  apyBase?: number;
  apyMean30d?: number;
}

const PROJECT_PREFERENCE: Record<string, string[]> = {
  ETH: ["lido", "rocket-pool", "binance-staked-eth"],
  SOL: ["marinade-finance", "jito", "jupiter-staked-sol"],
  AAVE: ["aave-v3", "aave-v2"],
  LINK: ["aave-v3", "compound-v3"],
};

function poolApy(pool: LlamaPool): number {
  return Number(pool.apy ?? pool.apyMean30d ?? pool.apyBase ?? 0) || 0;
}

function symbolMatches(pool: LlamaPool, symbol: string): boolean {
  const value = (pool.symbol ?? "").toUpperCase();
  const project = (pool.project ?? "").toLowerCase();
  if (value.includes("-") || value.includes("/") || value.includes(" ")) return false;
  if (project.includes("uniswap") || project.includes("curve") || project.includes("balancer")) {
    return false;
  }
  if (symbol === "ETH") {
    return value === "ETH" || value === "STETH" || value === "WSTETH";
  }
  if (symbol === "SOL") {
    return value === "SOL" || value === "MSOL" || value === "JITOSOL";
  }
  return value === symbol;
}

export function pickYields(
  pools: LlamaPool[],
): Partial<Record<DcaSymbol, { apy: number; project: string }>> {
  const result: Partial<Record<DcaSymbol, { apy: number; project: string }>> = {};

  for (const symbol of YIELD_SYMBOLS) {
    const preferred = PROJECT_PREFERENCE[symbol] ?? [];
    const matches = pools.filter(
      (pool) => symbolMatches(pool, symbol) && poolApy(pool) > 0 && poolApy(pool) < 20,
    );
    if (matches.length === 0) continue;

    const ranked = [...matches].sort((a, b) => {
      const aPref = preferred.findIndex((project) => a.project === project);
      const bPref = preferred.findIndex((project) => b.project === project);
      const aRank = aPref === -1 ? 50 : aPref;
      const bRank = bPref === -1 ? 50 : bPref;
      if (aRank !== bRank) return aRank - bRank;
      return poolApy(b) - poolApy(a);
    });

    const best = ranked[0];
    result[symbol] = {
      apy: poolApy(best),
      project: best.project ?? "defillama",
    };
  }

  return result;
}

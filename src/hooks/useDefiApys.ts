import { useQuery } from '@tanstack/react-query';

export interface DefiApyData {
  rocketPool: number;   // rETH – Rocket Pool (Ethereum)
  etherFi:    number;   // weETH – ether.fi (Ethereum, EigenLayer restaking)
  aaveEth:    number;   // Aave V3 WETH supply (Ethereum)
  marinade:   number;   // mSOL – Marinade Native (Solana)
  sanctumInf: number;   // INF – Sanctum Infinity (Solana)
  kaminoSol:  number;   // Kamino SOL lending (Solana)
  // kept for backward compat (used in StakingTimingCard etc.)
  lido: number;
  jito: number;
}

const FALLBACK: DefiApyData = {
  rocketPool: 3.05,
  etherFi:    4.38,
  aaveEth:    1.80,
  marinade:   7.37,
  sanctumInf: 8.00,
  kaminoSol:  4.20,
  lido:       3.40,
  jito:       7.50,
};

// ─── DefiLlama pool UUIDs (stable identifiers where known) ───────────────────
// Pool IDs from https://yields.llama.fi/pools
const POOL_IDS: Record<string, string> = {
  rocketPool: '5181e282-8e18-4b37-9a56-d59a3562db13',  // rETH · Ethereum
  aaveEth:    '825688c0-c694-4a6b-8497-177e425b7348',  // Aave V3 WETH · Ethereum
  kaminoSol:  '76b4f096-2c57-4529-9184-bdb040109437',  // Kamino SOL · Solana
  lido:       '747c1d2a-c668-4682-b9f9-296708a3dd90',  // stETH · Ethereum (compat)
  jito:       'd2b59998-0be0-4208-b576-5e5850cca22b',  // jitoSOL · Solana (compat)
};

// ─── DeFiLlama project slugs for project+symbol fallback ────────────────────
const PROJECT_LOOKUP: Array<{
  key: keyof DefiApyData;
  projects: string[];
  symbol: string;
  chain: string;
}> = [
  { key: 'etherFi',    projects: ['ether.fi', 'etherfi'],          symbol: 'weETH', chain: 'Ethereum' },
  { key: 'marinade',   projects: ['marinade-finance', 'marinade'], symbol: 'mSOL',  chain: 'Solana'   },
  { key: 'sanctumInf', projects: ['sanctum'],                      symbol: 'INF',   chain: 'Solana'   },
];

// ─── fetch ────────────────────────────────────────────────────────────────────
interface LlamaPool {
  pool:    string;
  project: string;
  symbol:  string;
  chain:   string;
  apy:     number;
}

async function fetchDefiApys(): Promise<DefiApyData> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let pools: LlamaPool[] = [];

  try {
    const res = await fetch('https://yields.llama.fi/pools', { signal: ctrl.signal });
    if (!res.ok) throw new Error(`DefiLlama status ${res.status}`);
    const json = await res.json();
    pools = (json.data ?? []) as LlamaPool[];
  } finally {
    clearTimeout(timer);
  }

  // Fast pool-ID map
  const byId = new Map<string, number>();
  for (const p of pools) {
    if (Number.isFinite(p.apy) && p.apy > 0) byId.set(p.pool, p.apy);
  }

  // Project+symbol fallback — find highest APY matching project+symbol+chain
  const byProject = (projectList: string[], sym: string, chain: string): number | null => {
    let best: number | null = null;
    for (const p of pools) {
      if (!projectList.includes(p.project)) continue;
      if (!p.symbol.toUpperCase().includes(sym.toUpperCase())) continue;
      if (p.chain !== chain) continue;
      if (Number.isFinite(p.apy) && p.apy > 0 && (best === null || p.apy > best)) best = p.apy;
    }
    return best;
  };

  const result: DefiApyData = {
    rocketPool: byId.get(POOL_IDS.rocketPool) ?? FALLBACK.rocketPool,
    aaveEth:    byId.get(POOL_IDS.aaveEth)    ?? FALLBACK.aaveEth,
    kaminoSol:  byId.get(POOL_IDS.kaminoSol)  ?? FALLBACK.kaminoSol,
    lido:       byId.get(POOL_IDS.lido)        ?? FALLBACK.lido,
    jito:       byId.get(POOL_IDS.jito)        ?? FALLBACK.jito,
    etherFi:    FALLBACK.etherFi,
    marinade:   FALLBACK.marinade,
    sanctumInf: FALLBACK.sanctumInf,
  };

  // Apply project+symbol lookups for newer protocols
  for (const { key, projects, symbol, chain } of PROJECT_LOOKUP) {
    const apy = byProject(projects, symbol, chain);
    if (apy !== null) result[key] = apy;
  }

  return result;
}

export function useDefiApys() {
  return useQuery({
    queryKey:        ['defi-apys-v2'],
    queryFn:         fetchDefiApys,
    staleTime:       5 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
    placeholderData: FALLBACK,
    retry: 2,
    retryDelay: (attempt) => Math.min(3000 * 2 ** attempt, 20_000),
  });
}

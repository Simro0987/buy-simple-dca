import { useQuery } from '@tanstack/react-query';

export interface DefiApyData {
  rocketPool: number;   // rETH
  lido: number;         // wstETH
  aaveEth: number;      // Aave V3 ETH supply
  jito: number;         // JitoSOL
  kaminoSol: number;    // Kamino SOL lending
}

const FALLBACK: DefiApyData = {
  rocketPool: 3.2,
  lido: 3.4,
  aaveEth: 1.8,
  jito: 7.5,
  kaminoSol: 4.2,
};

// DefiLlama pool UUIDs (stable identifiers)
const POOL_IDS: Record<string, string> = {
  rocketPool: '5181e282-8e18-4b37-9a56-d59a3562db13',   // rETH on Ethereum
  lido: '747c1d2a-c668-4682-b9f9-296708a3dd90',         // stETH/wstETH on Ethereum
  aaveEth: '825688c0-c694-4a6b-8497-177e425b7348',      // Aave V3 WETH on Ethereum
  jito: 'd2b59998-0be0-4208-b576-5e5850cca22b',         // JitoSOL on Solana
  kaminoSol: '76b4f096-2c57-4529-9184-bdb040109437',    // Kamino SOL lending
};

async function fetchDefiApys(): Promise<DefiApyData> {
  const ids = Object.values(POOL_IDS);
  const url = `https://yields.llama.fi/pools`;

  const res = await fetch(url);
  if (!res.ok) throw new Error('DefiLlama API error');

  const json = await res.json();
  const pools: Array<{ pool: string; apy: number }> = json.data ?? [];

  const poolMap = new Map<string, number>();
  for (const p of pools) {
    poolMap.set(p.pool, p.apy);
  }

  return {
    rocketPool: poolMap.get(POOL_IDS.rocketPool) ?? FALLBACK.rocketPool,
    lido: poolMap.get(POOL_IDS.lido) ?? FALLBACK.lido,
    aaveEth: poolMap.get(POOL_IDS.aaveEth) ?? FALLBACK.aaveEth,
    jito: poolMap.get(POOL_IDS.jito) ?? FALLBACK.jito,
    kaminoSol: poolMap.get(POOL_IDS.kaminoSol) ?? FALLBACK.kaminoSol,
  };
}

export function useDefiApys() {
  return useQuery({
    queryKey: ['defi-apys'],
    queryFn: fetchDefiApys,
    staleTime: 5 * 60 * 1000,    // 5 min
    refetchInterval: 5 * 60 * 1000,
    placeholderData: FALLBACK,
  });
}

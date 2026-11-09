// Solana on-chain helpers — gas estimator and Jito/Marinade exchange rates.
// Never throws; hard fallbacks keep the UI live even if RPC/API fail.

const SOL_RPCS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-rpc.publicnode.com',
];

const TIMEOUT_MS = 3000;
const withTimeout = <T,>(p: Promise<T>) =>
  Promise.race<T>([p, new Promise<T>((_, r) => setTimeout(() => r(new Error('timeout')), TIMEOUT_MS))]);

export interface SolGasData {
  baseFeeLamports: number;    // static base fee per signature (5000 lamports)
  priorityMicroLamports: number; // current median priority fee (micro-lamports per CU)
  source: 'live' | 'fallback';
}

export interface SolGasCosts {
  nativeStakeUsd: number;
  jupiterSwapUsd: number;
  jitoDepositUsd: number;
}

const CU_STAKE  = 30_000;   // native delegation ~small
const CU_JUP    = 400_000;  // typical Jupiter swap compute
const CU_JITO_DEPOSIT = 300_000;

export async function fetchSolGas(): Promise<SolGasData> {
  for (const url of SOL_RPCS) {
    try {
      const res = await withTimeout(fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getRecentPrioritizationFees', params: [] }),
      }));
      if (!res.ok) continue;
      const json = await res.json();
      const fees: Array<{ prioritizationFee: number }> = json?.result ?? [];
      const nonZero = fees.map(f => f.prioritizationFee).filter(v => v > 0).sort((a, b) => a - b);
      const median = nonZero.length ? nonZero[Math.floor(nonZero.length / 2)] : 5000;
      return {
        baseFeeLamports: 5000,
        priorityMicroLamports: median,
        source: 'live',
      };
    } catch { /* try next */ }
  }
  return { baseFeeLamports: 5000, priorityMicroLamports: 20_000, source: 'fallback' };
}

/** SOL fee = baseFee (lamports) + priority * CU / 1e6 (micro-lamports → lamports). */
export function solTxCost(gas: SolGasData, computeUnits: number, solPriceUsd: number): number {
  const lamports = gas.baseFeeLamports + (gas.priorityMicroLamports * computeUnits) / 1_000_000;
  return (lamports / 1e9) * solPriceUsd;
}

export function computeSolGasCosts(gas: SolGasData, solPriceUsd: number): SolGasCosts {
  return {
    nativeStakeUsd: solTxCost(gas, CU_STAKE, solPriceUsd),
    jupiterSwapUsd: solTxCost(gas, CU_JUP, solPriceUsd),
    jitoDepositUsd: solTxCost(gas, CU_JITO_DEPOSIT, solPriceUsd),
  };
}

/** Jito on-chain exchange rate SOL → JitoSOL. Falls back to a reasonable value. */
export async function fetchJitoRate(): Promise<{ jitoSolPerSol: number; source: 'live' | 'fallback' }> {
  try {
    const res = await withTimeout(fetch('https://kobe.mainnet.jito.network/api/v1/stake_pool_stats'));
    if (res.ok) {
      const j = await res.json();
      // apr endpoint often exposes conversion; be defensive
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rate = (j as any)?.pool?.conversion ?? (j as any)?.conversion;
      if (typeof rate === 'number' && rate > 0 && rate < 2) {
        return { jitoSolPerSol: rate, source: 'live' };
      }
    }
  } catch { /* ignore */ }
  return { jitoSolPerSol: 0.855, source: 'fallback' }; // ~1 SOL ≈ 0.855 JitoSOL (JitoSOL worth ~1.17 SOL)
}

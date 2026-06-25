import {
  fetchLlamaPools,
  normalizeApyPercent,
  type LlamaPool,
} from '@/lib/defiLlamaAggregator';

/** Simulated network latency so async fetch path is visible in UI. */
const FETCH_DELAY_MS = 350;

export interface HcdBorrowRates {
  aaveV3UsdcBorrowPct: number | null;
  kaminoUsdcBorrowPct: number | null;
  avgBorrowPct: number | null;
  unavailable: string[];
  fetchedAt: Date;
}

function pickBorrowApy(
  pools: LlamaPool[],
  filter: (p: LlamaPool) => boolean,
): number | null {
  let best: number | null = null;
  for (const p of pools) {
    if (!filter(p)) continue;
    const raw = p.apyBaseBorrow ?? p.apy;
    const val = normalizeApyPercent(raw);
    if (val == null || val > 25) continue;
    if (best === null || val > best) best = val;
  }
  return best;
}

/**
 * Live HCD borrow snapshot from DefiLlama yields.llama.fi/pools.
 * Filters Aave V3 + Kamino USDC borrow APYs; averages when both exist.
 * Swap this function's internals for your backend URL when ready.
 */
export async function fetchHcdBorrowRates(): Promise<HcdBorrowRates> {
  await new Promise(resolve => setTimeout(resolve, FETCH_DELAY_MS));

  try {
    const pools = await fetchLlamaPools();
    const unavailable: string[] = [];

    const aaveV3UsdcBorrowPct = pickBorrowApy(
      pools,
      p => {
        const project = p.project.toLowerCase();
        const sym = p.symbol.toUpperCase();
        return project.includes('aave') && sym.includes('USDC');
      },
    );
    if (aaveV3UsdcBorrowPct === null) unavailable.push('Aave V3');

    const kaminoUsdcBorrowPct = pickBorrowApy(
      pools,
      p => {
        if (p.chain !== 'Solana') return false;
        const project = p.project.toLowerCase();
        const sym = p.symbol.toUpperCase();
        return project.includes('kamino') && sym.includes('USDC');
      },
    );
    if (kaminoUsdcBorrowPct === null) unavailable.push('Kamino');

    const rates = [aaveV3UsdcBorrowPct, kaminoUsdcBorrowPct].filter(
      (r): r is number => r != null && Number.isFinite(r),
    );
    const avgBorrowPct =
      rates.length > 0
        ? Math.round((rates.reduce((s, v) => s + v, 0) / rates.length) * 100) / 100
        : null;

    return {
      aaveV3UsdcBorrowPct,
      kaminoUsdcBorrowPct,
      avgBorrowPct,
      unavailable,
      fetchedAt: new Date(),
    };
  } catch {
    return {
      aaveV3UsdcBorrowPct: null,
      kaminoUsdcBorrowPct: null,
      avgBorrowPct: null,
      unavailable: ['DefiLlama'],
      fetchedAt: new Date(),
    };
  }
}

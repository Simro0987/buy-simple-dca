const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
const KAMINO_METRICS_URL = `https://api.kamino.finance/kamino-market/${KAMINO_MAIN_MARKET}/reserves/metrics`;
const MORPHO_GRAPHQL = 'https://blue-api.morpho.org/graphql';

export interface HcdBorrowRates {
  aaveV3UsdcBorrowPct: number | null;
  kaminoUsdcBorrowPct: number | null;
  avgBorrowPct: number;
  unavailable: string[];
  fetchedAt: Date;
}

function decimalToPercent(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n) || n < 0) return null;
  // APIs return 0.057 for 5.7% or occasionally already in percent.
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  if (pct > 50) return null;
  return Math.round(pct * 100) / 100;
}

async function fetchMorphoUsdcBorrowPct(): Promise<number | null> {
  const query = `{
    markets(first: 100) {
      items {
        loanAsset { symbol }
        state { borrowApy }
      }
    }
  }`;
  const res = await fetch(MORPHO_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`Morpho ${res.status}`);
  const json = await res.json();
  const items = json?.data?.markets?.items ?? [];
  let best: number | null = null;
  for (const m of items) {
    if (m?.loanAsset?.symbol !== 'USDC') continue;
    const pct = decimalToPercent(m?.state?.borrowApy);
    if (pct == null) continue;
    if (best === null || pct > best) best = pct;
  }
  return best;
}

interface KaminoReserveMetric {
  liquidityToken: string;
  borrowApy: string;
  totalBorrowUsd: string;
}

async function fetchKaminoUsdcBorrowPct(): Promise<number | null> {
  const res = await fetch(KAMINO_METRICS_URL);
  if (!res.ok) throw new Error(`Kamino ${res.status}`);
  const rows = (await res.json()) as KaminoReserveMetric[];
  let best: { pct: number; tvl: number } | null = null;
  for (const r of rows) {
    if (r.liquidityToken !== 'USDC') continue;
    const pct = decimalToPercent(r.borrowApy);
    if (pct == null) continue;
    const tvl = parseFloat(r.totalBorrowUsd) || 0;
    if (!best || tvl > best.tvl) best = { pct, tvl };
  }
  return best?.pct ?? null;
}

/**
 * Live HCD borrow snapshot — Morpho (Aave/Morpho ETH path) + Kamino USDC.
 * On failure returns 0% average so UI clearly shows missing data (no mock APY).
 */
export async function fetchHcdIndicators(): Promise<HcdBorrowRates> {
  const unavailable: string[] = [];
  let aaveV3UsdcBorrowPct: number | null = null;
  let kaminoUsdcBorrowPct: number | null = null;

  const [morphoSettled, kaminoSettled] = await Promise.allSettled([
    fetchMorphoUsdcBorrowPct(),
    fetchKaminoUsdcBorrowPct(),
  ]);

  if (morphoSettled.status === 'fulfilled' && morphoSettled.value != null) {
    aaveV3UsdcBorrowPct = morphoSettled.value;
  } else {
    unavailable.push('Aave/Morpho');
  }

  if (kaminoSettled.status === 'fulfilled' && kaminoSettled.value != null) {
    kaminoUsdcBorrowPct = kaminoSettled.value;
  } else {
    unavailable.push('Kamino');
  }

  const rates = [aaveV3UsdcBorrowPct, kaminoUsdcBorrowPct].filter(
    (r): r is number => r != null && Number.isFinite(r),
  );
  const avgBorrowPct =
    rates.length > 0
      ? Math.round((rates.reduce((s, v) => s + v, 0) / rates.length) * 100) / 100
      : 0;

  return {
    aaveV3UsdcBorrowPct,
    kaminoUsdcBorrowPct,
    avgBorrowPct,
    unavailable,
    fetchedAt: new Date(),
  };
}

/** @deprecated use fetchHcdIndicators */
export const fetchHcdBorrowRates = fetchHcdIndicators;

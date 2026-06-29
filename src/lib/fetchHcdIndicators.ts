const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
const KAMINO_METRICS_URL = `https://api.kamino.finance/kamino-market/${KAMINO_MAIN_MARKET}/reserves/metrics`;

import {
  fetchAlchemixRoutingSnapshot,
  type AlchemixRoutingSnapshot,
} from '@/lib/alchemixProtocolRouting';
import {
  fetchArbitrumRoutingSnapshot,
  type ArbitrumRoutingSnapshot,
} from '@/lib/arbitrumProtocolRouting';
import {
  fetchKaminoRoutingSnapshot,
  type KaminoRoutingSnapshot,
} from '@/lib/kaminoProtocolRouting';

export interface HcdBorrowRates {
  morphoUsdcBorrowPct: number | null;
  aaveArbitrumUsdcBorrowPct: number | null;
  /** @deprecated use morphoUsdcBorrowPct */
  aaveV3UsdcBorrowPct: number | null;
  kaminoUsdcBorrowPct: number | null;
  avgBorrowPct: number;
  unavailable: string[];
  fetchedAt: Date;
  /** Layer 3 ETH — live Morpho vaults vs Aave proto_arbitrum_v3 comparison. */
  arbitrumRouting: ArbitrumRoutingSnapshot | null;
  /** Layer 3 SOL — Kamino reserves + auto-yield vault scoring. */
  kaminoRouting: KaminoRoutingSnapshot | null;
  /** Layer 4 ETH — Alchemix transmuter / farm / vault strategies. */
  alchemixRouting: AlchemixRoutingSnapshot | null;
}

function decimalToPercent(value: number | string | null | undefined): number | null {
  if (value == null) return null;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n) || n < 0) return null;
  const pct = n > 0 && n <= 1 ? n * 100 : n;
  if (pct > 50) return null;
  return Math.round(pct * 100) / 100;
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
 * Live HCD borrow snapshot — Arbitrum Morpho/Aave + Kamino + Alchemix routing.
 * On failure returns null APYs so UI clearly shows missing data (no mock APY).
 */
export async function fetchHcdIndicators(
  fallbackAlchemixApyPct?: number | null,
): Promise<HcdBorrowRates> {
  const unavailable: string[] = [];
  let kaminoUsdcBorrowPct: number | null = null;
  let arbitrumRouting: ArbitrumRoutingSnapshot | null = null;
  let kaminoRouting: KaminoRoutingSnapshot | null = null;
  let alchemixRouting: AlchemixRoutingSnapshot | null = null;

  const [routingSettled, kaminoBorrowSettled, kaminoRoutingSettled, alchemixSettled] =
    await Promise.allSettled([
      fetchArbitrumRoutingSnapshot(),
      fetchKaminoUsdcBorrowPct(),
      fetchKaminoRoutingSnapshot(),
      fetchAlchemixRoutingSnapshot(fallbackAlchemixApyPct),
    ]);

  if (routingSettled.status === 'fulfilled') {
    arbitrumRouting = routingSettled.value;
    if (!arbitrumRouting.winner && (arbitrumRouting.candidates?.length ?? 0) === 0) {
      unavailable.push('Morpho (Arbitrum)', 'Aave V3 (Arbitrum)');
    } else {
      if (!arbitrumRouting.morpho) unavailable.push('Morpho (Arbitrum)');
      if (!arbitrumRouting.aave) unavailable.push('Aave V3 (Arbitrum)');
    }
  } else {
    unavailable.push('Morpho (Arbitrum)', 'Aave V3 (Arbitrum)');
  }

  if (kaminoBorrowSettled.status === 'fulfilled' && kaminoBorrowSettled.value != null) {
    kaminoUsdcBorrowPct = kaminoBorrowSettled.value;
  } else {
    unavailable.push('Kamino borrow');
  }

  if (kaminoRoutingSettled.status === 'fulfilled') {
    kaminoRouting = kaminoRoutingSettled.value;
    kaminoUsdcBorrowPct = kaminoRouting?.usdcBorrowApyPct ?? kaminoUsdcBorrowPct;
    if (!kaminoRouting?.winner) unavailable.push('Kamino vaults');
  } else {
    unavailable.push('Kamino vaults');
  }

  if (alchemixSettled.status === 'fulfilled') {
    alchemixRouting = alchemixSettled.value;
    if (!alchemixRouting?.winner) unavailable.push('Alchemix');
  } else {
    unavailable.push('Alchemix');
  }

  const morphoUsdcBorrowPct = arbitrumRouting?.morpho?.usdcBorrowApyPct ?? null;
  const aaveArbitrumUsdcBorrowPct = arbitrumRouting?.aave?.usdcBorrowApyPct ?? null;

  const rates = [morphoUsdcBorrowPct, aaveArbitrumUsdcBorrowPct, kaminoUsdcBorrowPct].filter(
    (r): r is number => r != null && Number.isFinite(r),
  );
  const avgBorrowPct =
    rates.length > 0
      ? Math.round((rates.reduce((s, v) => s + v, 0) / rates.length) * 100) / 100
      : 0;

  return {
    morphoUsdcBorrowPct,
    aaveArbitrumUsdcBorrowPct,
    aaveV3UsdcBorrowPct: morphoUsdcBorrowPct,
    kaminoUsdcBorrowPct,
    avgBorrowPct,
    unavailable,
    fetchedAt: arbitrumRouting?.fetchedAt ?? kaminoRouting?.fetchedAt ?? new Date(),
    arbitrumRouting,
    kaminoRouting,
    alchemixRouting,
  };
}

/** @deprecated use fetchHcdIndicators */
export const fetchHcdBorrowRates = fetchHcdIndicators;

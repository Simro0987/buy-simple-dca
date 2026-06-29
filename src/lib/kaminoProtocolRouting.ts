/**
 * Layer 3 Solana — Kamino Main Market reserves + Auto-Yield vault strategies.
 */

import {
  buildKaminoCandidate,
  FALLBACK_KAMINO_VAULT_LABEL,
  KAMINO_COLLATERAL_TOKENS,
  selectBestKaminoCandidate,
  type KaminoCollateralCandidate,
  type KaminoCollateralToken,
  type KaminoVenueKind,
} from '@/lib/kaminoCollateralScoring';

export const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';
export const KAMINO_MAIN_MARKET_URL = 'https://app.kamino.finance/lend';
export const KAMINO_VAULTS_URL = 'https://app.kamino.finance/liquidity';
export const KAMINO_METRICS_URL =
  `https://api.kamino.finance/kamino-market/${KAMINO_MAIN_MARKET}/reserves/metrics`;
export const KAMINO_STRATEGIES_URL =
  'https://api.kamino.finance/strategies/metrics?env=mainnet-beta';

const RESERVE_TOKEN_MAP: Record<string, KaminoCollateralToken> = {
  SOL: 'SOL',
  MSOL: 'mSOL',
  JITOSOL: 'JitoSOL',
  JUPSOL: 'JupSOL',
  BSOL: 'bSOL',
};

const STABLE_TOKENS = new Set(['USDC', 'USDT', 'USDG', 'USDS', 'PYUSD', 'USDH']);

export interface KaminoRoutingSnapshot {
  candidates: KaminoCollateralCandidate[];
  winner: KaminoCollateralCandidate | null;
  usdcBorrowApyPct: number;
  fetchedAt: Date;
}

function decimalToPercent(value: number | string | null | undefined): number {
  if (value == null) return 0;
  const n = typeof value === 'string' ? parseFloat(value) : value;
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 0 && n <= 1 ? n * 100 : n;
}

function normalizeApy(value: number | string | null | undefined): number {
  const pct = decimalToPercent(value);
  if (pct > 100) return 0;
  return Math.round(pct * 100) / 100;
}

interface KaminoReserveMetric {
  liquidityToken: string;
  borrowApy: string;
  supplyApy: string;
  totalSupplyUsd: string;
  totalBorrowUsd: string;
  maxLtv?: string | number;
}

interface KaminoStrategyMetric {
  tokenA: string;
  tokenB: string;
  totalValueLocked: string;
  kaminoApy?: { totalApy?: string | number };
  apy?: { totalApy?: string | number };
}

function mapReserveToken(symbol: string): KaminoCollateralToken | null {
  return RESERVE_TOKEN_MAP[symbol?.toUpperCase()?.replace(/\s/g, '') ?? ''] ?? null;
}

function estimateIlRisk(tokenA: string, tokenB: string): number {
  const a = tokenA?.toUpperCase() ?? '';
  const b = tokenB?.toUpperCase() ?? '';
  const aStable = STABLE_TOKENS.has(a);
  const bStable = STABLE_TOKENS.has(b);
  if (aStable || bStable) return 15;
  const solInvolved = a === 'SOL' || b === 'SOL' || a.endsWith('SOL') || b.endsWith('SOL');
  if (solInvolved) return 35;
  return 60;
}

function strategyCollateralToken(tokenA: string, tokenB: string): KaminoCollateralToken {
  const pair = `${tokenA}-${tokenB}`.toUpperCase();
  if (pair.includes('MSOL')) return 'mSOL';
  if (pair.includes('JITOSOL')) return 'JitoSOL';
  if (pair.includes('JUPSOL')) return 'JupSOL';
  if (pair.includes('BSOL')) return 'bSOL';
  return 'SOL';
}

async function fetchKaminoUsdcBorrowPct(rows: KaminoReserveMetric[]): Promise<number> {
  let best: { pct: number; tvl: number } | null = null;
  for (const row of rows ?? []) {
    if (row?.liquidityToken !== 'USDC') continue;
    const pct = decimalToPercent(row?.borrowApy);
    const tvl = parseFloat(row?.totalBorrowUsd ?? '0') || 0;
    if (!best || tvl > best.tvl) best = { pct, tvl };
  }
  return best?.pct ?? 0;
}

function buildLendingCandidates(
  rows: KaminoReserveMetric[],
  usdcBorrowApyPct: number,
): KaminoCollateralCandidate[] {
  const candidates: KaminoCollateralCandidate[] = [];

  for (const row of rows ?? []) {
    const token = mapReserveToken(row?.liquidityToken ?? '');
    if (!token || !KAMINO_COLLATERAL_TOKENS.includes(token)) continue;

    const maxLtvPct = decimalToPercent(row?.maxLtv) || 0;
    const supplyApyPct = decimalToPercent(row?.supplyApy) || 0;
    const tvlUsd = parseFloat(row?.totalSupplyUsd ?? '0') || 0;
    if (maxLtvPct <= 0 && tvlUsd <= 0) continue;

    candidates.push(buildKaminoCandidate({
      venueKind: 'lending',
      venueLabel: `Kamino Main Market · ${row.liquidityToken} Reserve`,
      sourceUrl: KAMINO_MAIN_MARKET_URL,
      collateralToken: token,
      apyPct: supplyApyPct,
      tvlUsd,
      maxLtvPct,
      ilRiskPct: 0,
      usdcBorrowApyPct,
    }));
  }

  return candidates;
}

function buildAutoYieldCandidates(
  strategies: KaminoStrategyMetric[],
  usdcBorrowApyPct: number,
): KaminoCollateralCandidate[] {
  const candidates: KaminoCollateralCandidate[] = [];
  const minTvlUsd = 10_000;

  for (const strategy of strategies ?? []) {
    const tokenA = strategy?.tokenA ?? '';
    const tokenB = strategy?.tokenB ?? '';
    const pair = `${tokenA}-${tokenB}`.toUpperCase();
    const solRelated = pair.includes('SOL') || pair.includes('MSOL') || pair.includes('JITOSOL');
    if (!solRelated) continue;

    const tvlUsd = parseFloat(strategy?.totalValueLocked ?? '0') || 0;
    if (tvlUsd < minTvlUsd) continue;

    const apyPct = normalizeApy(strategy?.kaminoApy?.totalApy ?? strategy?.apy?.totalApy);
    const ilRiskPct = estimateIlRisk(tokenA, tokenB);

    candidates.push(buildKaminoCandidate({
      venueKind: 'auto-yield',
      venueLabel: `Kamino ${tokenA}-${tokenB} Auto-Yield`,
      sourceUrl: KAMINO_VAULTS_URL,
      collateralToken: strategyCollateralToken(tokenA, tokenB),
      apyPct,
      tvlUsd,
      maxLtvPct: 0,
      ilRiskPct,
      usdcBorrowApyPct,
    }));
  }

  return candidates;
}

/** Live Kamino reserve + auto-yield scoring snapshot for Layer 3 Solana routing. */
export async function fetchKaminoRoutingSnapshot(): Promise<KaminoRoutingSnapshot> {
  const [reserveSettled, strategySettled] = await Promise.allSettled([
    fetch(KAMINO_METRICS_URL).then(async res => {
      if (!res.ok) throw new Error(`Kamino metrics ${res.status}`);
      return (await res.json()) as KaminoReserveMetric[];
    }),
    fetch(KAMINO_STRATEGIES_URL).then(async res => {
      if (!res.ok) throw new Error(`Kamino strategies ${res.status}`);
      return (await res.json()) as KaminoStrategyMetric[];
    }),
  ]);

  const reserveRows = reserveSettled.status === 'fulfilled' ? reserveSettled.value : [];
  const strategies = strategySettled.status === 'fulfilled' ? strategySettled.value : [];
  const usdcBorrowApyPct = await fetchKaminoUsdcBorrowPct(reserveRows);

  const candidates = [
    ...buildLendingCandidates(reserveRows, usdcBorrowApyPct),
    ...buildAutoYieldCandidates(strategies, usdcBorrowApyPct),
  ];

  let winner = selectBestKaminoCandidate(candidates);
  if (!winner) {
    winner = buildKaminoCandidate({
      venueKind: 'auto-yield',
      venueLabel: FALLBACK_KAMINO_VAULT_LABEL,
      sourceUrl: KAMINO_VAULTS_URL,
      collateralToken: 'mSOL',
      apyPct: 4.2,
      tvlUsd: 695_000,
      maxLtvPct: 0,
      ilRiskPct: 20,
      usdcBorrowApyPct,
    });
  }

  return {
    candidates: candidates.length > 0 ? candidates : [winner],
    winner,
    usdcBorrowApyPct,
    fetchedAt: new Date(),
  };
}

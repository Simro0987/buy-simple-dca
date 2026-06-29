/**
 * Layer 4 Alchemix routing — transmuter, farms, and vault strategies.
 * Yields from DefiLlama; peg/LTV from protocol defaults when live data is sparse.
 */

import {
  buildAlchemixCandidate,
  selectBestAlchemixCandidate,
  type AlchemixStrategyCandidate,
} from '@/lib/alchemixCollateralScoring';
import { fetchLlamaPools, normalizeApyPercent } from '@/lib/defiLlamaAggregator';

export const ALCHEMIX_APP_URL = 'https://app.alchemix.fi/';
export const ALCHEMIX_ARBITRUM_URL = 'https://app.alchemix.fi/';

export interface AlchemixRoutingSnapshot {
  candidates: AlchemixStrategyCandidate[];
  winner: AlchemixStrategyCandidate | null;
  ethVaultApyPct: number;
  fetchedAt: Date;
}

const FALLBACK_ETH_VAULT_APY = 2.2;
const FALLBACK_ALUSD_FARM_APY = 8.1;
const FALLBACK_ARBITRUM_FARM_APY = 8.05;

function pickAlchemixApy(
  pools: Awaited<ReturnType<typeof fetchLlamaPools>>,
  symbol: string,
  chain: string,
): number | null {
  let best: number | null = null;
  for (const pool of pools ?? []) {
    if (!/alchemix/i.test(pool?.project ?? '')) continue;
    if (!(pool?.symbol ?? '').toUpperCase().includes(symbol.toUpperCase())) continue;
    if ((pool?.chain ?? '') !== chain) continue;
    const apy = normalizeApyPercent(pool?.apy);
    if (apy == null) continue;
    if (best == null || apy > best) best = apy;
  }
  return best;
}

function pickAlchemixFarmApy(
  pools: Awaited<ReturnType<typeof fetchLlamaPools>>,
  chain: string,
): number | null {
  let best: number | null = null;
  for (const pool of pools ?? []) {
    const sym = (pool?.symbol ?? '').toUpperCase();
    if (!sym.includes('ALUSD')) continue;
    if ((pool?.chain ?? '') !== chain) continue;
    const apy = normalizeApyPercent(pool?.apy);
    if (apy == null || apy > 50) continue;
    if (best == null || apy > best) best = apy;
  }
  return best;
}

function buildCandidates(input: {
  ethVaultApyPct: number;
  ethFarmApyPct: number;
  arbitrumFarmApyPct: number;
}): AlchemixStrategyCandidate[] {
  return [
    buildAlchemixCandidate({
      strategyId: 'transmuter',
      strategyLabel: 'Alchemix ETH Transmuter',
      network: 'Ethereum',
      sourceUrl: ALCHEMIX_APP_URL,
      yieldPct: input.ethVaultApyPct,
      ltvPct: 50,
      pegStabilityPct: 92,
    }),
    buildAlchemixCandidate({
      strategyId: 'vault',
      strategyLabel: 'Alchemix alETH Vault',
      network: 'Ethereum',
      sourceUrl: ALCHEMIX_APP_URL,
      yieldPct: input.ethVaultApyPct,
      ltvPct: 45,
      pegStabilityPct: 88,
    }),
    buildAlchemixCandidate({
      strategyId: 'farm',
      strategyLabel: 'Alchemix alUSD Farm',
      network: 'Ethereum',
      sourceUrl: ALCHEMIX_APP_URL,
      yieldPct: input.ethFarmApyPct,
      ltvPct: 40,
      pegStabilityPct: 78,
    }),
    buildAlchemixCandidate({
      strategyId: 'farm',
      strategyLabel: 'Alchemix alUSD Farm (Arbitrum)',
      network: 'Arbitrum',
      sourceUrl: ALCHEMIX_ARBITRUM_URL,
      yieldPct: input.arbitrumFarmApyPct,
      ltvPct: 40,
      pegStabilityPct: 75,
    }),
  ];
}

/** Live Alchemix strategy scoring snapshot for Layer 4 routing. */
export async function fetchAlchemixRoutingSnapshot(
  fallbackEthVaultApyPct?: number | null,
): Promise<AlchemixRoutingSnapshot> {
  let ethVaultApyPct = safeFallback(fallbackEthVaultApyPct, FALLBACK_ETH_VAULT_APY);
  let ethFarmApyPct = FALLBACK_ALUSD_FARM_APY;
  let arbitrumFarmApyPct = FALLBACK_ARBITRUM_FARM_APY;

  try {
    const pools = await fetchLlamaPools();
    ethVaultApyPct = pickAlchemixApy(pools, 'ETH', 'Ethereum') ?? ethVaultApyPct;
    ethFarmApyPct = pickAlchemixFarmApy(pools, 'Ethereum') ?? ethFarmApyPct;
    arbitrumFarmApyPct = pickAlchemixFarmApy(pools, 'Arbitrum') ?? arbitrumFarmApyPct;
  } catch {
    // keep fallbacks
  }

  const candidates = buildCandidates({
    ethVaultApyPct,
    ethFarmApyPct,
    arbitrumFarmApyPct,
  });
  const winner = selectBestAlchemixCandidate(candidates);

  return {
    candidates,
    winner,
    ethVaultApyPct,
    fetchedAt: new Date(),
  };
}

function safeFallback(value: number | null | undefined, fallback: number): number {
  return Number.isFinite(value) && (value ?? 0) > 0 ? (value as number) : fallback;
}

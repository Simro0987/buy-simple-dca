import {
  buildYieldEnginePlan,
  type YieldEnginePlan,
  type YieldEngineStrategy,
} from '@/lib/yieldEngine';

export interface NetworkBorrowSlice {
  network: 'ETH' | 'SOL' | 'Alchemix';
  labelSk: string;
  labelEn: string;
  borrowedUsdcUsd: number;
  borrowApyPct: number;
}

export interface GlobalYieldEnginePlan extends YieldEnginePlan {
  totalBorrowedUsdcUsd: number;
  breakdown: NetworkBorrowSlice[];
  unifiedRecommendationSk: string;
  unifiedRecommendationEn: string;
}

function roundUsd(value: number): number {
  return Math.round(value * 100) / 100;
}

function strategyLabel(strategy: YieldEngineStrategy, sk: boolean): string {
  if (strategy === 'auto_staking') return sk ? 'Auto-Staking' : 'Auto-Staking';
  if (strategy === 'stable_swap') return sk ? 'Stable Swap' : 'Stable Swap';
  return sk ? 'Hold / Cash (alebo splatiť dlh)' : 'Hold / Cash (or repay debt)';
}

export function buildGlobalYieldEnginePlan(input: {
  ethBorrowUsdc: number;
  solBorrowUsdc: number;
  alchemixBorrowUsdc?: number;
  usdcDebtUsd: number;
  totalCollateralUsd: number;
  maxLtvPct: number;
  borrowApyPct: number;
  ethBorrowApyPct?: number;
  solBorrowApyPct?: number;
  usdcSupplyApyPct?: number;
  volatilityHigh: boolean;
  supplyOnlyMode: boolean;
  yieldVaultProtocol?: string | null;
  yieldVaultLabel?: string | null;
  yieldVaultUrl?: string | null;
}): GlobalYieldEnginePlan {
  const ethSlice = roundUsd(input.ethBorrowUsdc);
  const solSlice = roundUsd(input.solBorrowUsdc);
  const alchemixSlice = roundUsd(input.alchemixBorrowUsdc ?? 0);

  const breakdown: NetworkBorrowSlice[] = [];
  if (ethSlice > 0) {
    breakdown.push({
      network: 'ETH',
      labelSk: 'ETH · Morpho/Aave (Arbitrum)',
      labelEn: 'ETH · Morpho/Aave (Arbitrum)',
      borrowedUsdcUsd: ethSlice,
      borrowApyPct: input.ethBorrowApyPct ?? input.borrowApyPct,
    });
  }
  if (solSlice > 0) {
    breakdown.push({
      network: 'SOL',
      labelSk: 'SOL · Kamino',
      labelEn: 'SOL · Kamino',
      borrowedUsdcUsd: solSlice,
      borrowApyPct: input.solBorrowApyPct ?? input.borrowApyPct,
    });
  }
  if (alchemixSlice > 0) {
    breakdown.push({
      network: 'Alchemix',
      labelSk: 'Alchemix · syntetický dlh',
      labelEn: 'Alchemix · synthetic debt',
      borrowedUsdcUsd: alchemixSlice,
      borrowApyPct: input.borrowApyPct,
    });
  }

  const proposedBorrowUsd = roundUsd(ethSlice + solSlice + alchemixSlice);
  const basePlan = buildYieldEnginePlan({
    usdcDebtUsd: input.usdcDebtUsd,
    proposedBorrowUsd,
    collateralUsd: input.totalCollateralUsd,
    maxLtvPct: input.maxLtvPct,
    borrowApyPct: input.borrowApyPct,
    usdcSupplyApyPct: input.usdcSupplyApyPct,
    volatilityHigh: input.volatilityHigh,
    supplyOnlyMode: input.supplyOnlyMode,
    yieldVaultProtocol: input.yieldVaultProtocol,
    yieldVaultLabel: input.yieldVaultLabel,
    yieldVaultUrl: input.yieldVaultUrl,
  });

  const totalBorrowedUsdcUsd = roundUsd(Math.max(input.usdcDebtUsd, proposedBorrowUsd));
  const rec = basePlan.recommendedStrategy;

  const unifiedRecommendationSk = basePlan.enabled
    ? [
        `Jednotné odporúčanie: ${strategyLabel(rec, true)}`,
        basePlan.negativeCarry ? 'Negatívny carry — zvážte splatenie dlhu.' : '',
        basePlan.planLineSk.split('\n').slice(1).join('\n'),
      ].filter(Boolean).join('\n')
    : (basePlan.blockReasonSk ?? '');

  const unifiedRecommendationEn = basePlan.enabled
    ? [
        `Unified recommendation: ${strategyLabel(rec, false)}`,
        basePlan.negativeCarry ? 'Negative carry — consider debt repayment.' : '',
        basePlan.planLineEn.split('\n').slice(1).join('\n'),
      ].filter(Boolean).join('\n')
    : (basePlan.blockReasonEn ?? '');

  return {
    ...basePlan,
    borrowedUsdcUsd: totalBorrowedUsdcUsd,
    deployUsd: totalBorrowedUsdcUsd,
    totalBorrowedUsdcUsd,
    breakdown,
    unifiedRecommendationSk,
    unifiedRecommendationEn,
  };
}

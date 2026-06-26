import { computePortfolioLtvPct } from '@/lib/lbtcAccumulationStrategy';

export type LtvHealthStatus = 'safe' | 'warning' | 'danger';

export interface CollateralManagementSnapshot {
  deployedQty: number;
  deployedUsd: number;
  targetQty: number;
  targetUsd: number;
  currentLtvPct: number;
  projectedLtvPct: number;
  maxLtvPct: number;
  ltvStatus: LtvHealthStatus;
  recommendedProtocol: string;
  recommendedVenue: string;
  recommendedToken: string;
  recommendedUrl?: string;
}

export function hasActiveCollateralPosition(deployedQty: number, usdcDebt: number): boolean {
  return Math.max(0, deployedQty ?? 0) > 0 || Math.max(0, usdcDebt ?? 0) > 0;
}

function resolveLtvStatus(currentLtvPct: number, maxLtvPct: number): LtvHealthStatus {
  if (currentLtvPct <= 0) return 'safe';
  if (currentLtvPct > maxLtvPct) return 'danger';
  if (currentLtvPct >= maxLtvPct - 3) return 'warning';
  return 'safe';
}

export function buildCollateralManagementSnapshot(input: {
  deployedQty: number;
  collateralPrice: number;
  targetQty: number;
  usdcDebt: number;
  maxLtvPct: number;
  proposedBorrowUsd?: number;
  recommendedProtocol?: string | null;
  recommendedVenue?: string | null;
  recommendedToken?: string | null;
  recommendedUrl?: string | null;
}): CollateralManagementSnapshot {
  const deployedQty = Math.max(0, input.deployedQty ?? 0);
  const price = Math.max(0, input.collateralPrice ?? 0);
  const targetQty = Math.max(0, input.targetQty ?? 0);
  const deployedUsd = deployedQty * price;
  const targetUsd = targetQty * price;
  const maxLtvPct = Math.max(0, input.maxLtvPct ?? 33);
  const debt = Math.max(0, input.usdcDebt ?? 0);
  const borrow = Math.max(0, input.proposedBorrowUsd ?? 0);
  const hasActivePosition = hasActiveCollateralPosition(deployedQty, debt);

  let currentLtvPct = 0;
  let projectedLtvPct = 0;
  if (hasActivePosition && deployedUsd > 0) {
    currentLtvPct = computePortfolioLtvPct(debt, deployedUsd);
    projectedLtvPct = computePortfolioLtvPct(debt + borrow, deployedUsd);
  }

  return {
    deployedQty,
    deployedUsd,
    targetQty,
    targetUsd,
    currentLtvPct,
    projectedLtvPct,
    maxLtvPct,
    ltvStatus: hasActivePosition && deployedUsd > 0
      ? resolveLtvStatus(projectedLtvPct || currentLtvPct, maxLtvPct)
      : 'safe',
    recommendedProtocol: input.recommendedProtocol?.trim() || 'Morpho',
    recommendedVenue: input.recommendedVenue?.trim() || 'Morpho / Aave (Arbitrum)',
    recommendedToken: input.recommendedToken?.trim() || 'wETH',
    recommendedUrl: input.recommendedUrl?.trim() || undefined,
  };
}

export const LTV_STATUS_CLASS: Record<LtvHealthStatus, string> = {
  safe: 'text-emerald-400',
  warning: 'text-amber-400',
  danger: 'text-red-400',
};

import type { HcdIndicators, VolatilityRegime } from '@/lib/hcdArchitecture';
import { HCD_LTV_MAX_RESTRICTED } from '@/lib/hcdArchitecture';
import type { StakedEntry } from '@/lib/stakingLedger';

export type ExitAlertVariant = 'urgent' | 'warning' | 'opportunity';

export interface ExitStrategyAlert {
  active: boolean;
  variant: ExitAlertVariant;
  commandSk: string;
  commandEn: string;
  reasonSk?: string;
  reasonEn?: string;
  withdrawQty?: number;
  repayUsdc?: number;
  tokenLabel?: string;
  decimals?: number;
  /** Tactical layer 3: show LTV 20% withdrawal recommendation line */
  showLtvWithdrawLine?: boolean;
}

export const EXIT_BORROW_URGENT_PCT = 8;
export const EXIT_BORROW_OPPORTUNITY_PCT = 4;
export const EXIT_ALCHEMIX_APY_FLOOR = 2.5;
export const EXIT_TARGET_LTV_PCT = HCD_LTV_MAX_RESTRICTED;

export function sumTacticalDeployedQty(entries: StakedEntry[], symbol: 'ETH' | 'SOL'): number {
  const patterns = symbol === 'ETH' ? [/aave/i, /morpho/i] : [/kamino/i];
  return entries
    .filter(e => patterns.some(p => p.test(e.protocol)))
    .reduce((s, e) => s + e.amount, 0);
}

export function sumCoreDeployedQty(entries: StakedEntry[], symbol: 'ETH' | 'SOL'): number {
  const patterns = symbol === 'ETH' ? [/rocket\s*pool/i, /reth/i] : [/marinade/i, /msol/i];
  return entries
    .filter(e => patterns.some(p => p.test(e.protocol)))
    .reduce((s, e) => s + e.amount, 0);
}

/** Withdraw qty to return to target LTV: (collateralUsd - debt/targetLtv) / price */
export function computeWithdrawToTargetLtv(
  collateralUsd: number,
  price: number,
  usdcDebt: number,
  targetLtvPct: number = EXIT_TARGET_LTV_PCT,
): { withdrawQty: number; repayUsdc: number; currentLtvPct: number } {
  if (collateralUsd <= 0 || price <= 0) {
    return { withdrawQty: 0, repayUsdc: 0, currentLtvPct: 0 };
  }

  const targetLtv = targetLtvPct / 100;
  const currentLtvPct = usdcDebt > 0 ? (usdcDebt / collateralUsd) * 100 : 0;

  const minCollateralUsdAtTargetLtv = usdcDebt > 0 ? usdcDebt / targetLtv : collateralUsd;
  const withdrawUsd = Math.max(0, collateralUsd - minCollateralUsdAtTargetLtv);
  const withdrawQty = withdrawUsd / price;

  const targetDebtUsd = collateralUsd * targetLtv;
  const repayUsdc = Math.max(0, usdcDebt - targetDebtUsd);

  return { withdrawQty, repayUsdc, currentLtvPct };
}

export function computeTacticalWithdrawAlert(input: {
  indicators: HcdIndicators;
  collateralQty: number;
  deployedCollateralQty: number;
  collateralPrice: number;
  usdcDebt: number;
  tokenLabel: string;
  decimals: number;
}): ExitStrategyAlert | null {
  const urgent = input.indicators.borrowApyPct > EXIT_BORROW_URGENT_PCT
    || input.indicators.volatilityRegime === 'high';
  if (!urgent) return null;

  const effectiveCollateralQty = Math.max(input.deployedCollateralQty, input.collateralQty);
  const collateralUsd = effectiveCollateralQty * input.collateralPrice;
  const { withdrawQty: ltvWithdraw, repayUsdc, currentLtvPct } = computeWithdrawToTargetLtv(
    collateralUsd,
    input.collateralPrice,
    input.usdcDebt,
  );

  let withdrawQty = ltvWithdraw;
  if (withdrawQty <= 0 && effectiveCollateralQty > 0) {
    if (input.usdcDebt > 0 && currentLtvPct > EXIT_TARGET_LTV_PCT) {
      withdrawQty = effectiveCollateralQty;
    } else if (input.collateralQty > 0) {
      withdrawQty = input.collateralQty;
    } else {
      withdrawQty = effectiveCollateralQty;
    }
  }

  return {
    active: true,
    variant: 'urgent',
    commandSk: '🚨 PRÍKAZ NA ÚSTUP: Znížte kolaterál, likvidačné riziko stúplo.',
    commandEn: '🚨 EXIT ORDER: Reduce collateral, liquidation risk has increased.',
    withdrawQty,
    repayUsdc,
    tokenLabel: input.tokenLabel,
    decimals: input.decimals,
    showLtvWithdrawLine: true,
  };
}

export function computeAlchemixRebalanceAlert(alchemixApyPct: number): ExitStrategyAlert | null {
  if (!Number.isFinite(alchemixApyPct) || alchemixApyPct >= EXIT_ALCHEMIX_APY_FLOOR) return null;

  return {
    active: true,
    variant: 'warning',
    commandSk: '⚠️ ODPORÚČANIE NA REBALANS: Výnosy sú nízke, zvážte presun do Core Stakingu.',
    commandEn: '⚠️ REBALANCE RECOMMENDATION: Yields are low, consider moving to Core Staking.',
  };
}

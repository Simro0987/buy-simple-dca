import type { HcdIndicators, VolatilityRegime } from '@/lib/hcdArchitecture';
import { HCD_LTV_MAX_RESTRICTED } from '@/lib/hcdArchitecture';
import type { StakedEntry } from '@/lib/stakingLedger';

export type ExitAlertVariant = 'urgent' | 'warning' | 'opportunity';

export interface ExitStrategyAlert {
  active: boolean;
  variant: ExitAlertVariant;
  commandSk: string;
  commandEn: string;
  reasonSk: string;
  reasonEn: string;
  withdrawQty?: number;
  repayUsdc?: number;
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

/** How much collateral to withdraw / USDC to repay to reach target LTV. */
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

  const requiredCollateralUsd = usdcDebt > 0 ? usdcDebt / targetLtv : collateralUsd;
  const withdrawUsd = Math.max(0, collateralUsd - requiredCollateralUsd);
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
  const { withdrawQty, repayUsdc } = computeWithdrawToTargetLtv(
    collateralUsd,
    input.collateralPrice,
    input.usdcDebt,
  );

  const qtyStr = withdrawQty.toFixed(input.decimals);

  return {
    active: true,
    variant: 'urgent',
    commandSk: `🚨 URGENTNÝ PRÍKAZ NA ÚSTUP: Znížte kolaterál o ${qtyStr} ${input.tokenLabel} a splaťte časť USDC dlhu!`,
    commandEn: `🚨 URGENT EXIT ORDER: Reduce collateral by ${qtyStr} ${input.tokenLabel} and repay part of your USDC debt!`,
    reasonSk: 'Dôvod: Úrokové sadzby na trhu/Volatilita prekročili bezpečné HCD limity. Likvidačné riziko stúplo. Stiahnutím kapitálu stabilizujete pozíciu.',
    reasonEn: 'Reason: Market borrow rates/volatility exceeded safe HCD limits. Liquidation risk increased. Withdrawing capital stabilizes your position.',
    withdrawQty,
    repayUsdc,
  };
}

export function computeAlchemixRebalanceAlert(alchemixApyPct: number): ExitStrategyAlert | null {
  if (!Number.isFinite(alchemixApyPct) || alchemixApyPct >= EXIT_ALCHEMIX_APY_FLOOR) return null;

  return {
    active: true,
    variant: 'warning',
    commandSk: '⚠️ ODPORÚČANIE NA REBALANS: Zvážte výber ETH z Alchemix Vaultu.',
    commandEn: '⚠️ REBALANCE RECOMMENDATION: Consider withdrawing ETH from the Alchemix Vault.',
    reasonSk: 'Dôvod: Výnosy generované vaultom sú príliš nízke. Strategicky výhodnejšie je preliať tento kapitál do Core Stakingu (rETH), kde je vyšší čistý výnos bez smart contract toxicity.',
    reasonEn: 'Reason: Vault yields are too low. Strategically better to rotate this capital into Core Staking (rETH) for higher net yield without smart-contract toxicity.',
  };
}

export function computeCoreOpportunityAlert(input: {
  rebalanceUnlocked: boolean;
  volatilityRegime: VolatilityRegime;
  netBorrowCostPct: number;
  coreDeployedQty: number;
  tacticalTargetQty: number;
  tacticalDeployedQty: number;
  tokenLabel: string;
  decimals: number;
}): ExitStrategyAlert | null {
  const active = input.rebalanceUnlocked
    && input.volatilityRegime === 'low'
    && input.netBorrowCostPct < EXIT_BORROW_OPPORTUNITY_PCT;
  if (!active) return null;

  const withdrawQty = Math.min(
    input.coreDeployedQty,
    Math.max(0, input.tacticalTargetQty - input.tacticalDeployedQty),
  );

  const qtyStr = withdrawQty.toFixed(input.decimals);

  return {
    active: true,
    variant: 'opportunity',
    commandSk: `💡 PRÍLEŽITOSŤ: Môžete bezpečne odobrať ${qtyStr} ${input.tokenLabel} z pasívneho stakingu.`,
    commandEn: `💡 OPPORTUNITY: You can safely withdraw ${qtyStr} ${input.tokenLabel} from passive staking.`,
    reasonSk: 'Dôvod: Trh je stabilný a úvery sú lacné. HCD Mozog odporúča presunúť časť kapitálu do Vrstvy 3 na zachytenie taktickej likvidity.',
    reasonEn: 'Reason: Market is stable and borrows are cheap. HCD brain recommends moving part of capital to Layer 3 to capture tactical liquidity.',
    withdrawQty,
  };
}

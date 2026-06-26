import type { CyborgAction } from '@/lib/cyborgTerminalEngine';
import type { HcdIndicators } from '@/lib/hcdArchitecture';
import { computeGasBuffer } from '@/lib/hcdActionPlanLogic';
import { sumTacticalDeployedQty } from '@/lib/hcdExitStrategy';
import type { StakedEntry } from '@/lib/stakingLedger';

export const LTV_TARGET_PCT = 30;
export const LTV_MAX_PCT = 33;
export const LTV_WARNING_FROM_PCT = 27;

export type LtvHealthStatus = 'safe' | 'warning' | 'danger';
export type GasHealthStatus = 'ok' | 'low';
export type CyborgNextActionId = 'stable' | 'rebalance' | 'profit_claim' | 'repay' | 'deploy';

export interface CyborgHealthSnapshot {
  currentLtvPct: number;
  ltvStatus: LtvHealthStatus;
  gasStatus: GasHealthStatus;
  nextActionId: CyborgNextActionId;
  nextActionLabel: string;
}

export function computePortfolioCurrentLtv(input: {
  ethTacticalQty: number;
  solTacticalQty: number;
  ethPrice: number;
  solPrice: number;
  usdcDebt: number;
}): number {
  const ethUsd = Math.max(0, input.ethTacticalQty ?? 0) * Math.max(0, input.ethPrice ?? 0);
  const solUsd = Math.max(0, input.solTacticalQty ?? 0) * Math.max(0, input.solPrice ?? 0);
  const collateralUsd = ethUsd + solUsd;
  const debt = Math.max(0, input.usdcDebt ?? 0);
  if (collateralUsd <= 0 || debt <= 0) return 0;
  return Math.round((debt / collateralUsd) * 1000) / 10;
}

export function getLtvHealthStatus(
  currentLtvPct: number,
  maxLtvPct = LTV_MAX_PCT,
  warningFromPct = LTV_WARNING_FROM_PCT,
): LtvHealthStatus {
  const ltv = currentLtvPct ?? 0;
  if (!Number.isFinite(ltv) || ltv <= 0) return 'safe';
  if (ltv > maxLtvPct) return 'danger';
  if (ltv >= warningFromPct) return 'warning';
  return 'safe';
}

export function getGasHealthStatus(
  ethTotalQty: number | null | undefined,
  solTotalQty: number | null | undefined,
): GasHealthStatus {
  const eth = computeGasBuffer('ETH', ethTotalQty);
  const sol = computeGasBuffer('SOL', solTotalQty);
  const ethNeedsTopUp = eth.totalQty > 0 && eth.availableQty <= eth.bufferQty;
  const solNeedsTopUp = sol.totalQty > 0 && sol.availableQty <= sol.bufferQty;
  return ethNeedsTopUp || solNeedsTopUp ? 'low' : 'ok';
}

const NEXT_ACTION_LABELS: Record<CyborgNextActionId, { sk: string; en: string }> = {
  stable: { sk: 'Stable', en: 'Stable' },
  rebalance: { sk: 'Rebalance', en: 'Rebalance' },
  profit_claim: { sk: 'Profit Claim', en: 'Profit Claim' },
  repay: { sk: 'Repay', en: 'Repay' },
  deploy: { sk: 'Deploy', en: 'Deploy' },
};

export function resolveNextAction(input: {
  sk: boolean;
  rebalanceLocked: boolean;
  takeProfitDeltaUsdc: number;
  pendingLayerDeltaQty: number;
  cyborgAction?: CyborgAction;
  ltvStatus: LtvHealthStatus;
}): { id: CyborgNextActionId; label: string } {
  if ((input.takeProfitDeltaUsdc ?? 0) > 0) {
    return { id: 'profit_claim', label: input.sk ? NEXT_ACTION_LABELS.profit_claim.sk : NEXT_ACTION_LABELS.profit_claim.en };
  }
  if (input.ltvStatus === 'danger' || input.cyborgAction === 'REPAY_DEBT') {
    return { id: 'repay', label: input.sk ? NEXT_ACTION_LABELS.repay.sk : NEXT_ACTION_LABELS.repay.en };
  }
  if (!input.rebalanceLocked && (input.pendingLayerDeltaQty ?? 0) > 0) {
    return { id: 'rebalance', label: input.sk ? NEXT_ACTION_LABELS.rebalance.sk : NEXT_ACTION_LABELS.rebalance.en };
  }
  if (input.cyborgAction === 'DEPOSIT_BORROW') {
    return { id: 'deploy', label: input.sk ? NEXT_ACTION_LABELS.deploy.sk : NEXT_ACTION_LABELS.deploy.en };
  }
  return { id: 'stable', label: input.sk ? NEXT_ACTION_LABELS.stable.sk : NEXT_ACTION_LABELS.stable.en };
}

export function buildCyborgHealthSnapshot(input: {
  sk: boolean;
  ethEntries: StakedEntry[];
  solEntries: StakedEntry[];
  ethPrice: number;
  solPrice: number;
  ethTotalQty: number;
  solTotalQty: number;
  usdcDebt: number;
  maxLtvPct?: number;
  rebalanceLocked: boolean;
  takeProfitDeltaUsdc: number;
  pendingLayerDeltaQty: number;
  cyborgAction?: CyborgAction;
}): CyborgHealthSnapshot {
  const ethTacticalQty = sumTacticalDeployedQty(input.ethEntries, 'ETH');
  const solTacticalQty = sumTacticalDeployedQty(input.solEntries, 'SOL');
  const currentLtvPct = computePortfolioCurrentLtv({
    ethTacticalQty,
    solTacticalQty,
    ethPrice: input.ethPrice,
    solPrice: input.solPrice,
    usdcDebt: input.usdcDebt,
  });
  const ltvStatus = getLtvHealthStatus(currentLtvPct, input.maxLtvPct ?? LTV_MAX_PCT);
  const gasStatus = getGasHealthStatus(input.ethTotalQty, input.solTotalQty);
  const next = resolveNextAction({
    sk: input.sk,
    rebalanceLocked: input.rebalanceLocked,
    takeProfitDeltaUsdc: input.takeProfitDeltaUsdc,
    pendingLayerDeltaQty: input.pendingLayerDeltaQty,
    cyborgAction: input.cyborgAction,
    ltvStatus,
  });

  return {
    currentLtvPct,
    ltvStatus,
    gasStatus,
    nextActionId: next.id,
    nextActionLabel: next.label,
  };
}

export function buildTacticalPlanHint(input: {
  sk: boolean;
  symbol: 'ETH' | 'SOL';
  indicators?: HcdIndicators;
  decisionReasonSk?: string;
  decisionReasonEn?: string;
}): string {
  const parts: string[] = [];
  if (input.indicators?.volatilityRegime === 'high') {
    parts.push(
      input.sk
        ? 'Vzhľadom na zvýšenú volatilitu sme sprísnili LTV limity a odporúčame znížiť expozíciu v LBTC.'
        : 'Due to elevated volatility we tightened LTV caps and recommend reducing LBTC exposure.',
    );
  }
  if (input.indicators?.borrowWarning) {
    parts.push(
      input.sk
        ? 'Vysoký USDC borrow APY — taktická vrstva uprednostňuje bezpečnejší kolaterál a nižší dlh.'
        : 'High USDC borrow APY — tactical layer favors safer collateral and lower debt.',
    );
  }
  const reason = (input.sk ? input.decisionReasonSk : input.decisionReasonEn)?.replace(/^(Dôvod|Reason):\s*/i, '');
  if (reason) parts.push(reason);
  if (parts.length > 0) return parts.join(' ');
  return input.sk
    ? `Taktický krok na ${input.symbol} podľa aktuálneho scoring enginu a HCD limitov.`
    : `Tactical ${input.symbol} step based on the current scoring engine and HCD limits.`;
}

export function buildTakeProfitPlanHint(input: {
  sk: boolean;
  takeProfitPercent: number;
  hasEarnedProfit: boolean;
  temperamentPct: number;
}): string {
  if (!input.hasEarnedProfit) {
    return input.sk
      ? 'Take Profit cieli len na už vygenerovaný zisk — istina zostáva nedotknutá.'
      : 'Take Profit targets earned profit only — principal stays protected.';
  }
  const pct = Math.round((input.takeProfitPercent ?? 0) * 100);
  return input.sk
    ? `Pri temperamente ${input.temperamentPct}% systém presúva ${pct}% realizovaného zisku do USDC, zvyšok kapitálu zostáva v pracovných vrstvách.`
    : `At ${input.temperamentPct}% temperament, the system moves ${pct}% of realized profit into USDC while keeping working capital in layers.`;
}

export function buildCorePlanHint(input: {
  sk: boolean;
  symbol: 'ETH' | 'SOL';
  apyText?: string | null;
}): string {
  const apy = input.apyText ? ` (${input.apyText} APY)` : '';
  return input.sk
    ? `Core vrstva drží ${input.symbol} v natívnom stakingu${apy} — stabilný výnos bez pákového dlhu.`
    : `Core layer holds ${input.symbol} in native staking${apy} — stable yield without leverage.`;
}

export function buildAlchemixPlanHint(input: {
  sk: boolean;
  locked: boolean;
  decisionReasonSk?: string;
  decisionReasonEn?: string;
}): string {
  if (input.locked) {
    return input.sk
      ? 'Alchemix je dočasne uzamknutý — kapitál bol presmerovaný do Vrstiev 2 a 3 kvôli slabému výnosu alebo riziku.'
      : 'Alchemix is temporarily locked — capital was redirected to Layers 2 and 3 due to weak yield or risk.';
  }
  const reason = (input.sk ? input.decisionReasonSk : input.decisionReasonEn) ?? '';
  if (reason) return reason.replace(/^(Dôvod|Reason):\s*/i, '');
  return input.sk
    ? 'Self-repaying pozícia cez Alchemix — výnos z aktív postupne spláca syntetický dlh.'
    : 'Self-repaying Alchemix position — asset yield gradually repays synthetic debt.';
}

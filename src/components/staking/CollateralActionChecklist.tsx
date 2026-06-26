import { useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Lang } from '@/lib/i18n';
import {
  collateralActionKey,
  countCollateralBatchTransactions,
  hasEnoughGasForBatch,
  type CollateralActionId,
} from '@/lib/atomicActionPlan';
import type { CollateralManagementSnapshot } from '@/lib/collateralManagement';
import { LTV_STATUS_CLASS } from '@/lib/collateralManagement';
import { AtomicActionBlock } from '@/components/staking/AtomicActionBlock';
import type { PortfolioBalanceUpdate } from '@/contexts/PortfolioContext';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { buildCollateralDepositUpdate } from '@/lib/cyborgPortfolio';
import { evaluateTokenRequirement, isNewCollateralPosition } from '@/lib/portfolioTokenBalance';

export interface CollateralActionChecklistProps {
  lang: Lang;
  sk: boolean;
  snapshot: CollateralManagementSnapshot;
  copyCollateralQty: number;
  collateralQty: number;
  collateralLabel: string;
  baseAssetSymbol: 'ETH' | 'SOL';
  collateralDecimals: number;
  safeBorrowUsdc: number;
  supplyOnlyMode: boolean;
  protocolUrl?: string;
  collateralContract?: string;
  gasAvailableEth: number;
  execDisabled?: boolean;
  planKey: string;
  isConfirmed: (id: CollateralActionId) => boolean;
  onConfirm: (id: CollateralActionId, update: PortfolioBalanceUpdate) => void;
  onRevert: (id: CollateralActionId) => void;
  onBatchConfirm: () => void;
  onManageGlobalYield?: () => void;
  showManageGlobalYield?: boolean;
  usdcDebt?: number;
}

export function CollateralActionChecklist({
  lang,
  sk,
  snapshot,
  copyCollateralQty,
  collateralQty,
  collateralLabel,
  baseAssetSymbol,
  collateralDecimals,
  safeBorrowUsdc,
  supplyOnlyMode,
  protocolUrl,
  collateralContract,
  gasAvailableEth,
  execDisabled,
  isConfirmed,
  onConfirm,
  onRevert,
  onBatchConfirm,
  onManageGlobalYield,
  showManageGlobalYield = false,
  usdcDebt,
}: CollateralActionChecklistProps) {
  const { portfolioData } = usePortfolio();

  const depositCheck = useMemo(
    () => evaluateTokenRequirement(portfolioData ?? null, collateralLabel, copyCollateralQty, {
      totalUsd: copyCollateralQty * (Number(snapshot?.targetUsd ?? 0) / Math.max(Number(snapshot?.targetQty ?? 0), 1e-9)),
    }),
    [portfolioData, collateralLabel, copyCollateralQty, snapshot?.targetUsd, snapshot?.targetQty],
  );

  const safeCollateral = Number(snapshot?.deployedQty ?? 0);
  const safeBorrow = Number(usdcDebt ?? 0);
  const safeCollateralQty = Number.isFinite(safeCollateral) ? safeCollateral : 0;
  const safeBorrowUsd = Number.isFinite(safeBorrow) ? safeBorrow : 0;
  const safeDeployedUsd = Number.isFinite(Number(snapshot?.deployedUsd ?? 0))
    ? Number(snapshot?.deployedUsd ?? 0)
    : 0;

  const depositUsd = copyCollateralQty * (Number(snapshot?.targetUsd ?? 0) / Math.max(Number(snapshot?.targetQty ?? 0), 1e-9));
  const ltvClass = LTV_STATUS_CLASS[snapshot?.ltvStatus ?? 'safe'];
  const isNewPosition = isNewCollateralPosition(safeCollateralQty, safeBorrowUsd);
  const includeBorrow = !supplyOnlyMode && safeBorrowUsdc > 0 && !isNewPosition && safeCollateralQty > 0;

  const projectedLtv = Number(snapshot?.projectedLtvPct ?? 0);
  const currentLtv = Number(snapshot?.currentLtvPct ?? 0);
  const calculatedLtvPct = Number.isFinite(projectedLtv) && projectedLtv > 0
    ? projectedLtv
    : (Number.isFinite(currentLtv) ? currentLtv : 0);
  const calculatedLTV = `${calculatedLtvPct.toFixed(1)}%`;
  const displayLTV = (safeCollateralQty === 0 && safeBorrowUsd === 0) ? '0.0%' : calculatedLTV;

  const batchTxCount = countCollateralBatchTransactions({
    depositQty: copyCollateralQty,
    borrowUsd: safeBorrowUsdc,
    includeBorrow,
  });
  const batchGasOk = hasEnoughGasForBatch(gasAvailableEth, batchTxCount);

  const pendingCount = [
    copyCollateralQty > 0 && !isConfirmed('deposit'),
    includeBorrow && !isConfirmed('borrow'),
  ].filter(Boolean).length;

  return (
    <div className="space-y-2 rounded-lg border border-violet-500/25 bg-violet-500/5 p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-violet-200/90">
        {sk ? 'Collateral Management · Vrstva 3' : 'Collateral Management · Layer 3'}
      </p>

      <div className="space-y-1 text-[10px] text-muted-foreground">
        <p>
          {sk ? 'Aktuálny kolaterál' : 'Current collateral'}:{' '}
          <span className="font-mono font-semibold text-foreground tabular-nums">
            {safeCollateralQty.toFixed(collateralDecimals)} {collateralLabel}
          </span>
          {' · '}
          <span className="tabular-nums">{safeDeployedUsd.toFixed(2)} USD</span>
        </p>
        <p>
          {sk ? 'LTV Status' : 'LTV Status'}:{' '}
          <span className={`font-mono font-semibold tabular-nums ${ltvClass}`}>
            {displayLTV}
          </span>
          {' / max '}
          {Number(snapshot?.maxLtvPct ?? 0)}%
        </p>
        <p>
          {sk ? 'Odporúčaný protokol' : 'Recommended protocol'}:{' '}
          <span className="text-foreground font-medium">
            {snapshot.recommendedProtocol} · {snapshot.recommendedVenue}
          </span>
        </p>
      </div>

      {supplyOnlyMode && (
        <p className="text-[10px] text-emerald-300/90 leading-snug">
          {sk
            ? 'Supply Only Mode — len navýšenie supply kolaterálu, bez borrow.'
            : 'Supply Only Mode — collateral supply only, no borrow.'}
        </p>
      )}

      {copyCollateralQty > 0 && (
        <AtomicActionBlock
          lang={lang}
          title={sk ? 'Vložiť kolaterál' : 'Deposit collateral'}
          tokenAmount={copyCollateralQty}
          tokenSymbol={collateralLabel}
          usdAmount={depositUsd}
          decimals={collateralDecimals}
          actionUrl={protocolUrl}
          contractHint={collateralContract ? `Contract: ${collateralContract}` : undefined}
          confirmed={isConfirmed('deposit')}
          disabled={execDisabled}
          tokenCheck={depositCheck}
          onConfirm={() => onConfirm('deposit', buildCollateralDepositUpdate(baseAssetSymbol, copyCollateralQty))}
          onRevert={() => onRevert('deposit')}
        />
      )}

      {includeBorrow && (
        <AtomicActionBlock
          lang={lang}
          title={sk ? 'Požičať USDC' : 'Borrow USDC'}
          tokenAmount={safeBorrowUsdc}
          tokenSymbol="USDC"
          usdAmount={safeBorrowUsdc}
          decimals={2}
          actionUrl={protocolUrl}
          contractHint={snapshot.recommendedVenue}
          confirmed={isConfirmed('borrow')}
          disabled={execDisabled}
          onConfirm={() => onConfirm('borrow', { usdcBorrowed: safeBorrowUsdc })}
          onRevert={() => onRevert('borrow')}
        />
      )}

      {pendingCount > 1 && (
        <div className="rounded-lg border border-violet-500/30 bg-violet-500/5 p-2.5 space-y-2">
          {!batchGasOk && (
            <p className="text-[10px] text-red-300/90 font-medium leading-snug">
              {sk ? 'Nedostatok Gasu na Batch transakciu.' : 'Insufficient gas for batch transaction.'}
            </p>
          )}
          <Button
            type="button"
            size="sm"
            disabled={execDisabled || !batchGasOk}
            onClick={onBatchConfirm}
            className="w-full h-9 text-[10px] font-semibold touch-manipulation bg-violet-600 hover:bg-violet-500 text-white"
          >
            {sk ? `Potvrdiť všetko (${pendingCount})` : `Confirm all (${pendingCount})`}
          </Button>
        </div>
      )}

      {showManageGlobalYield && onManageGlobalYield && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onManageGlobalYield}
          className="w-full h-8 text-[10px] font-medium text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/10"
        >
          {sk ? 'Manažovať v Global Yield Engine' : 'Manage in Global Yield Engine'}
        </Button>
      )}
    </div>
  );
}

export function isCollateralPlanComplete(input: {
  copyCollateralQty: number;
  borrowUsd: number;
  supplyOnlyMode: boolean;
  isConfirmed: (id: CollateralActionId) => boolean;
}): boolean {
  const steps: boolean[] = [];
  if (input.copyCollateralQty > 0) steps.push(input.isConfirmed('deposit'));
  if (!input.supplyOnlyMode && input.borrowUsd > 0) steps.push(input.isConfirmed('borrow'));
  if (steps.length === 0) return false;
  return steps.every(Boolean);
}

export function collateralPlanKeys(planKey: string): string[] {
  return [
    collateralActionKey(planKey, 'deposit'),
    collateralActionKey(planKey, 'borrow'),
  ];
}

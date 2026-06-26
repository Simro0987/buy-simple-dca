import { Button } from '@/components/ui/button';
import { Lang } from '@/lib/i18n';
import {
  countActiveBatchTransactions,
  hasEnoughGasForBatch,
  type AtomicActionId,
} from '@/lib/atomicActionPlan';
import type { BorrowedUsdcSplitPlan } from '@/lib/borrowedUsdcCapitalSplit';
import { LBTC_ARB_CONTRACT } from '@/lib/cyborgBlockchain';
import { AtomicActionBlock } from '@/components/staking/AtomicActionBlock';
import type { PortfolioBalanceUpdate } from '@/contexts/PortfolioContext';

export const USDC_ARB_CONTRACT = '0xaf88d065e77c8cC2239327C5EDb3A432268e5831';

export interface AtomicTacticalPlanChecklistProps {
  lang: Lang;
  sk: boolean;
  usdcSplit: BorrowedUsdcSplitPlan;
  copyCollateralQty: number;
  collateralQty: number;
  collateralLabel: string;
  collateralUsd: number;
  collateralDecimals: number;
  safeBorrowUsdc: number;
  protocolUrl?: string;
  collateralContract?: string;
  gasAvailableEth: number;
  execDisabled?: boolean;
  isConfirmed: (id: AtomicActionId) => boolean;
  onConfirm: (id: AtomicActionId, update: PortfolioBalanceUpdate) => void;
  onRevert: (id: AtomicActionId) => void;
  onBatchConfirm: () => void;
}

export function AtomicTacticalPlanChecklist({
  lang,
  sk,
  usdcSplit,
  copyCollateralQty,
  collateralQty,
  collateralLabel,
  collateralUsd,
  collateralDecimals,
  safeBorrowUsdc,
  protocolUrl,
  collateralContract,
  gasAvailableEth,
  execDisabled,
  isConfirmed,
  onConfirm,
  onRevert,
  onBatchConfirm,
}: AtomicTacticalPlanChecklistProps) {
  const borrowUsd = usdcSplit.totalBorrowUsd > 0 ? usdcSplit.totalBorrowUsd : safeBorrowUsdc;
  const depositUsd = copyCollateralQty * (collateralUsd / Math.max(collateralQty, 1e-9));

  const batchTxCount = countActiveBatchTransactions({
    depositQty: copyCollateralQty,
    borrowUsd,
    reserveUsd: usdcSplit.reserveUsd,
    yieldUsd: usdcSplit.yieldUsd,
    growthUsd: usdcSplit.growthUsd,
  });
  const batchGasOk = hasEnoughGasForBatch(gasAvailableEth, batchTxCount);

  const pendingCount = [
    copyCollateralQty > 0 && !isConfirmed('deposit'),
    borrowUsd > 0 && !isConfirmed('borrow'),
    usdcSplit.reserveUsd > 0 && !isConfirmed('reserve'),
    usdcSplit.yieldUsd > 0 && !isConfirmed('yield'),
    usdcSplit.growthUsd > 0 && !isConfirmed('growth'),
  ].filter(Boolean).length;

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-200/90">
        {sk ? 'Atomic Action Plan' : 'Atomic Action Plan'}
      </p>

      {usdcSplit.safetyMode && (
        <p className="text-[10px] text-amber-200/90 leading-snug">
          {sk
            ? 'LTV blízko max limitu — Yield a Rast vynulované, celý úver ide do Rezervy.'
            : 'LTV near max cap — Yield and Growth zeroed; full borrow kept as Reserve.'}
        </p>
      )}

      <p className="text-[9px] text-muted-foreground tabular-nums">
        {sk ? 'Pomer' : 'Split'}: {usdcSplit.ratios.reservePct.toFixed(1)}% / {usdcSplit.ratios.yieldPct.toFixed(1)}% / {usdcSplit.ratios.growthPct.toFixed(1)}%
        {' · '}
        {sk ? 'Projektované LTV' : 'Projected LTV'}: {usdcSplit.projectedLtvPct.toFixed(1)}%
      </p>

      {copyCollateralQty > 0 && (
        <AtomicActionBlock
          lang={lang}
          title={sk ? '1. Vložiť kolaterál' : '1. Deposit collateral'}
          tokenAmount={copyCollateralQty}
          tokenSymbol={collateralLabel}
          usdAmount={depositUsd}
          decimals={collateralDecimals}
          actionUrl={protocolUrl}
          contractHint={collateralContract ? `Contract: ${collateralContract}` : undefined}
          confirmed={isConfirmed('deposit')}
          disabled={execDisabled}
          onConfirm={() => onConfirm('deposit', { rEthQty: collateralQty })}
          onRevert={() => onRevert('deposit')}
        />
      )}

      {borrowUsd > 0 && (
        <AtomicActionBlock
          lang={lang}
          title={sk ? '2. Požičať USDC' : '2. Borrow USDC'}
          tokenAmount={borrowUsd}
          tokenSymbol="USDC"
          usdAmount={borrowUsd}
          decimals={2}
          actionUrl={protocolUrl}
          contractHint={`USDC · ${USDC_ARB_CONTRACT}`}
          confirmed={isConfirmed('borrow')}
          disabled={execDisabled}
          onConfirm={() => onConfirm('borrow', { usdcBorrowed: borrowUsd })}
          onRevert={() => onRevert('borrow')}
        />
      )}

      {usdcSplit.reserveUsd > 0 && (
        <AtomicActionBlock
          lang={lang}
          title={sk ? '3. Ponechať v USDC (Rezerva)' : '3. Keep in USDC (Reserve)'}
          tokenAmount={usdcSplit.reserveUsd}
          tokenSymbol="USDC"
          usdAmount={usdcSplit.reserveUsd}
          decimals={2}
          actionUrl={protocolUrl}
          contractHint={sk ? 'Hotovostný vankúš na splátku dlhu' : 'Cash cushion for debt repayment'}
          confirmed={isConfirmed('reserve')}
          disabled={execDisabled}
          onConfirm={() => onConfirm('reserve', {})}
          onRevert={() => onRevert('reserve')}
        />
      )}

      {usdcSplit.yieldUsd > 0 && (
        <AtomicActionBlock
          lang={lang}
          title={sk ? '4. Vložiť do Vaultu (Výnos)' : '4. Deposit to Vault (Yield)'}
          tokenAmount={usdcSplit.yieldUsd}
          tokenSymbol="USDC"
          usdAmount={usdcSplit.yieldUsd}
          decimals={2}
          actionUrl={usdcSplit.yieldVault.url}
          contractHint={usdcSplit.yieldVault.venueLabel}
          confirmed={isConfirmed('yield')}
          disabled={execDisabled}
          onConfirm={() => onConfirm('yield', {})}
          onRevert={() => onRevert('yield')}
        />
      )}

      {usdcSplit.growthUsd > 0 && (
        <AtomicActionBlock
          lang={lang}
          title={sk ? '5. Swapnúť na LBTC (Rast)' : '5. Swap to LBTC (Growth)'}
          tokenAmount={usdcSplit.growthUsd}
          tokenSymbol="USDC"
          usdAmount={usdcSplit.growthUsd}
          decimals={2}
          actionUrl={usdcSplit.dex.url}
          contractHint={`LBTC · ${LBTC_ARB_CONTRACT} · ≈ ${usdcSplit.lbtcQty.toFixed(6)} LBTC`}
          confirmed={isConfirmed('growth')}
          disabled={execDisabled}
          onConfirm={() => onConfirm('growth', { lbtcQty: usdcSplit.lbtcQty })}
          onRevert={() => onRevert('growth')}
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
            disabled={execDisabled || !batchGasOk || pendingCount === 0}
            onClick={onBatchConfirm}
            className="w-full h-9 text-[10px] font-semibold touch-manipulation bg-violet-600 hover:bg-violet-500 text-white"
          >
            {sk ? `Potvrdiť všetko (${pendingCount})` : `Confirm all (${pendingCount})`}
          </Button>
          <p className="text-[9px] text-muted-foreground tabular-nums">
            {sk ? 'Dostupný ETH na gas' : 'ETH gas available'}: {gasAvailableEth.toFixed(4)}
            {' · '}
            {sk ? 'Odhad' : 'Est.'} {batchTxCount} tx
          </p>
        </div>
      )}
    </div>
  );
}

export function isAtomicTacticalPlanComplete(input: {
  usdcSplit: BorrowedUsdcSplitPlan | null | undefined;
  copyCollateralQty: number;
  borrowUsd: number;
  isConfirmed: (id: AtomicActionId) => boolean;
}): boolean {
  if (!input.usdcSplit?.enabled || input.usdcSplit.blocked) return false;
  const steps: boolean[] = [];
  if (input.copyCollateralQty > 0) steps.push(input.isConfirmed('deposit'));
  if (input.borrowUsd > 0) steps.push(input.isConfirmed('borrow'));
  if (input.usdcSplit.reserveUsd > 0) steps.push(input.isConfirmed('reserve'));
  if (input.usdcSplit.yieldUsd > 0) steps.push(input.isConfirmed('yield'));
  if (input.usdcSplit.growthUsd > 0) steps.push(input.isConfirmed('growth'));
  return steps.length > 0 && steps.every(Boolean);
}

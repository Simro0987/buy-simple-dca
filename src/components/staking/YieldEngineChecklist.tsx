import { Lang } from '@/lib/i18n';
import {
  countYieldEngineBatchTransactions,
  hasEnoughGasForBatch,
  type YieldEngineActionId,
} from '@/lib/atomicActionPlan';
import type { YieldEnginePlan, YieldEngineStrategy } from '@/lib/yieldEngine';
import { AtomicActionBlock } from '@/components/staking/AtomicActionBlock';
import type { PortfolioBalanceUpdate } from '@/contexts/PortfolioContext';

const STRATEGY_BADGE: Record<YieldEngineStrategy, { sk: string; en: string }> = {
  auto_staking: { sk: 'Odporúčané', en: 'Recommended' },
  stable_swap: { sk: 'Odporúčané', en: 'Recommended' },
  hold_cash: { sk: 'Odporúčané', en: 'Recommended' },
};

function strategyTitle(
  strategy: YieldEngineStrategy,
  sk: boolean,
  recommended: YieldEngineStrategy,
): string {
  const badge = strategy === recommended
    ? (sk ? ` · ${STRATEGY_BADGE[strategy].sk}` : ` · ${STRATEGY_BADGE[strategy].en}`)
    : '';
  if (strategy === 'auto_staking') {
    return sk ? `Auto-Staking${badge}` : `Auto-Staking${badge}`;
  }
  if (strategy === 'stable_swap') {
    return sk ? `Stable Swap${badge}` : `Stable Swap${badge}`;
  }
  return sk ? `Hold / Cash${badge}` : `Hold / Cash${badge}`;
}

export interface YieldEngineChecklistProps {
  lang: Lang;
  sk: boolean;
  plan: YieldEnginePlan;
  gasAvailableEth: number;
  execDisabled?: boolean;
  isConfirmed: (id: YieldEngineActionId) => boolean;
  onConfirm: (id: YieldEngineActionId, update: PortfolioBalanceUpdate) => void;
  onRevert: (id: YieldEngineActionId) => void;
}

export function YieldEngineChecklist({
  lang,
  sk,
  plan,
  gasAvailableEth,
  execDisabled,
  isConfirmed,
  onConfirm,
  onRevert,
}: YieldEngineChecklistProps) {
  if (!plan.enabled) {
    return plan.blockReasonSk || plan.blockReasonEn ? (
      <div className="rounded-lg border border-border/50 bg-muted/15 p-2.5">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Yield Engine
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {sk ? plan.blockReasonSk : plan.blockReasonEn}
        </p>
      </div>
    ) : null;
  }

  const amount = plan.deployUsd;
  const rec = plan.recommendedStrategy;
  const batchGasOk = hasEnoughGasForBatch(
    gasAvailableEth,
    countYieldEngineBatchTransactions(amount),
  );

  return (
    <div className="space-y-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-200/90">
        Yield Engine
      </p>

      {plan.negativeCarry && (
        <p className="text-[10px] text-red-300/90 font-medium leading-snug">
          {sk
            ? 'Borrowing is negative carry! Consider repaying debt.'
            : 'Borrowing is negative carry! Consider repaying debt.'}
        </p>
      )}

      <p className="text-[9px] text-muted-foreground tabular-nums">
        {sk ? 'Požičané USDC' : 'Borrowed USDC'}: {plan.borrowedUsdcUsd.toFixed(2)}
        {' · '}
        Borrow {plan.borrowApyPct.toFixed(2)}% vs Yield {plan.bestYieldApyPct.toFixed(2)}%
      </p>

      {!batchGasOk && (
        <p className="text-[10px] text-red-300/90 font-medium leading-snug">
          {sk ? 'Nedostatok Gasu na Batch transakciu.' : 'Insufficient gas for batch transaction.'}
        </p>
      )}

      <AtomicActionBlock
        lang={lang}
        title={strategyTitle('auto_staking', sk, rec)}
        tokenAmount={amount}
        tokenSymbol="USDC"
        usdAmount={amount}
        decimals={2}
        actionUrl={plan.autoStaking.url}
        contractHint={`${plan.autoStaking.venueLabel} · ${plan.autoStaking.apyPct.toFixed(2)}% APY`}
        confirmed={isConfirmed('auto_stake')}
        disabled={execDisabled || !batchGasOk}
        onConfirm={() => onConfirm('auto_stake', {})}
        onRevert={() => onRevert('auto_stake')}
      />

      <AtomicActionBlock
        lang={lang}
        title={strategyTitle('stable_swap', sk, rec)}
        tokenAmount={amount}
        tokenSymbol="USDC"
        usdAmount={amount}
        decimals={2}
        actionUrl={plan.stableSwap.url}
        contractHint={`→ ${plan.stableSwap.token} · ${plan.stableSwap.apyPct.toFixed(2)}% APY`}
        confirmed={isConfirmed('stable_swap')}
        disabled={execDisabled || !batchGasOk}
        onConfirm={() => onConfirm('stable_swap', {})}
        onRevert={() => onRevert('stable_swap')}
      />

      <AtomicActionBlock
        lang={lang}
        title={strategyTitle('hold_cash', sk, rec)}
        tokenAmount={amount}
        tokenSymbol="USDC"
        usdAmount={amount}
        decimals={2}
        actionUrl={undefined}
        contractHint={sk ? plan.holdCash.reasonSk : plan.holdCash.reasonEn}
        confirmed={isConfirmed('hold_cash')}
        disabled={execDisabled || !batchGasOk}
        onConfirm={() => onConfirm('hold_cash', {})}
        onRevert={() => onRevert('hold_cash')}
      />
    </div>
  );
}

export function isYieldEnginePlanComplete(
  plan: YieldEnginePlan | null | undefined,
  isConfirmed: (id: YieldEngineActionId) => boolean,
): boolean {
  if (!plan?.enabled || plan.blocked || plan.deployUsd <= 0) return false;
  return (
    isConfirmed('auto_stake')
    || isConfirmed('stable_swap')
    || isConfirmed('hold_cash')
  );
}

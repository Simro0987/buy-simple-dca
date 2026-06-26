import { Lang } from '@/lib/i18n';
import { GLOBAL_YIELD_ENGINE_PLAN_KEY } from '@/lib/atomicActionPlan';
import type { GlobalYieldEnginePlan } from '@/lib/globalYieldEngine';
import {
  YieldEngineChecklist,
  isYieldEnginePlanComplete,
  type YieldEngineChecklistProps,
} from '@/components/staking/YieldEngineChecklist';
import type { PortfolioBalanceUpdate } from '@/contexts/PortfolioContext';
import type { YieldEngineActionId } from '@/lib/atomicActionPlan';
import { yieldEngineActionKey } from '@/lib/atomicActionPlan';

export const GLOBAL_YIELD_ENGINE_SECTION_ID = 'global-yield-engine';

export interface GlobalYieldEngineProps {
  lang: Lang;
  sk: boolean;
  plan: GlobalYieldEnginePlan;
  gasAvailableEth: number;
  execDisabled?: boolean;
  isConfirmed: (id: YieldEngineActionId) => boolean;
  onConfirm: (id: YieldEngineActionId, update: PortfolioBalanceUpdate) => void;
  onRevert: (id: YieldEngineActionId) => void;
}

export function GlobalYieldEngine({
  lang,
  sk,
  plan,
  gasAvailableEth,
  execDisabled,
  isConfirmed,
  onConfirm,
  onRevert,
}: GlobalYieldEngineProps) {
  const checklistProps: YieldEngineChecklistProps = {
    lang,
    sk,
    plan,
    gasAvailableEth,
    execDisabled,
    isConfirmed,
    onConfirm,
    onRevert,
    titleSk: 'GLOBAL YIELD ENGINE',
    titleEn: 'GLOBAL YIELD ENGINE',
    showTotalBorrow: true,
    unifiedRecommendationSk: plan.unifiedRecommendationSk,
    unifiedRecommendationEn: plan.unifiedRecommendationEn,
    breakdown: plan.breakdown,
  };

  return (
    <section
      id={GLOBAL_YIELD_ENGINE_SECTION_ID}
      className="scroll-mt-4 rounded-xl border border-emerald-500/35 bg-emerald-500/5 p-3 space-y-3"
    >
      <YieldEngineChecklist {...checklistProps} />
    </section>
  );
}

export function isGlobalYieldEngineComplete(
  plan: GlobalYieldEnginePlan | null | undefined,
  isConfirmed: (id: YieldEngineActionId) => boolean,
): boolean {
  return isYieldEnginePlanComplete(plan, isConfirmed);
}

export function globalYieldEngineActionKey(actionId: YieldEngineActionId): string {
  return yieldEngineActionKey(GLOBAL_YIELD_ENGINE_PLAN_KEY, actionId);
}

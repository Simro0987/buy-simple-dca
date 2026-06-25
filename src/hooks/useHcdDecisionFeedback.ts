import { useCallback, useEffect, useSyncExternalStore } from 'react';
import {
  getDecisionForStep,
  getStrategyConfidence,
  HCD_DECISION_LOG_EVENT,
  loadDecisionLog,
  processPerformanceRewards,
  rateDecision,
  type DecisionRating,
} from '@/lib/hcdDecisionLog';

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener(HCD_DECISION_LOG_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(HCD_DECISION_LOG_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function useHcdDecisionFeedback(portfolioUsd: number) {
  const decisionLog = useSyncExternalStore(subscribe, loadDecisionLog, () => []);

  useEffect(() => {
    if (portfolioUsd <= 0) return;
    processPerformanceRewards(portfolioUsd);
  }, [portfolioUsd, decisionLog.length]);

  const getRating = useCallback((stepKey: string) => {
    return getDecisionForStep(stepKey)?.userRating ?? null;
  }, [decisionLog]);

  const getConfidence = useCallback((stepKey: string) => {
    const strategyKey = stepKey.replace(/^hcd-plan-/, '');
    return getStrategyConfidence(strategyKey);
  }, [decisionLog]);

  const submitRating = useCallback((stepKey: string, rating: DecisionRating) => {
    rateDecision(stepKey, rating);
  }, []);

  return {
    decisionLog,
    getRating,
    getConfidence,
    submitRating,
  };
}

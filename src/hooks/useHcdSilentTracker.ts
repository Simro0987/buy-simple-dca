import { useEffect, useSyncExternalStore } from 'react';
import {
  capturePortfolioSnapshot,
  HCD_SILENT_TRACKER_EVENT,
  loadStrategyCalibration,
  markAlgorithmStable,
  setAlgorithmCalibrating,
  type StrategyCalibration,
} from '@/lib/hcdSilentTracker';
import {
  HCD_DECISION_LOG_EVENT,
  loadDecisionLog,
  processSilentPerformanceChecks,
} from '@/lib/hcdDecisionLog';
import type { PortfolioData } from '@/lib/portfolioData';

function subscribe(onStoreChange: () => void): () => void {
  const handler = () => onStoreChange();
  window.addEventListener(HCD_DECISION_LOG_EVENT, handler);
  window.addEventListener(HCD_SILENT_TRACKER_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(HCD_DECISION_LOG_EVENT, handler);
    window.removeEventListener(HCD_SILENT_TRACKER_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

export function useHcdSilentTracker(portfolioData: PortfolioData, usdcDebt: number) {
  const decisionLog = useSyncExternalStore(subscribe, loadDecisionLog, () => []);
  const calibration = useSyncExternalStore(
    subscribe,
    loadStrategyCalibration,
    (): StrategyCalibration => ({
      layerBias: { core: 1, tactical: 1, alchemix: 1 },
      algorithmState: 'stable',
      lastCalibrationAt: null,
      lastOptimizedLayer: null,
      lastPnlUsd: null,
      lastPnlEth: null,
    }),
  );

  useEffect(() => {
    if (portfolioData.loading) return;
    const snapshot = capturePortfolioSnapshot(portfolioData, usdcDebt);
    if (snapshot.totalUsd <= 0) return;

    const pending = decisionLog.some(e => !e.confidenceRewardApplied);
    if (pending) setAlgorithmCalibrating();

    processSilentPerformanceChecks(snapshot);

    const stillPending = loadDecisionLog().some(e => !e.confidenceRewardApplied);
    if (!stillPending) markAlgorithmStable();
  }, [portfolioData, usdcDebt, decisionLog.length]);

  return { decisionLog, calibration };
}

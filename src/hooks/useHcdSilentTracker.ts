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

const DEFAULT_CALIBRATION = (): StrategyCalibration => ({
  layerBias: { core: 1, tactical: 1, alchemix: 1 },
  algorithmState: 'stable',
  lastCalibrationAt: null,
  lastOptimizedLayer: null,
  lastPnlUsd: null,
  lastPnlEth: null,
});

/** Read-only state for HCD Learning Log — does not run background checks. */
export function useHcdSilentTrackerState() {
  const decisionLog = useSyncExternalStore(subscribe, loadDecisionLog, () => []);
  const calibration = useSyncExternalStore(
    subscribe,
    loadStrategyCalibration,
    DEFAULT_CALIBRATION,
  );
  return { decisionLog, calibration };
}

/**
 * Background 24h PnL engine — deferred so balance UI renders first.
 * Secondary priority vs on-chain balance display.
 */
export function useHcdSilentTrackerEngine(
  portfolioData: PortfolioData,
  usdcDebt: number,
  enabled: boolean,
) {
  const pendingCount = useSyncExternalStore(
    subscribe,
    () => loadDecisionLog().filter(e => !e.confidenceRewardApplied).length,
    () => 0,
  );

  useEffect(() => {
    if (!enabled || !portfolioData.balancesReady) return;

    const timeoutId = window.setTimeout(() => {
      try {
        const snapshot = capturePortfolioSnapshot(portfolioData, usdcDebt);
        if (snapshot.totalUsd <= 0 && portfolioData.totalEthPortfolio <= 0 && portfolioData.totalSolPortfolio <= 0) {
          return;
        }

        if (pendingCount > 0) setAlgorithmCalibrating();

        processSilentPerformanceChecks(snapshot);

        const stillPending = loadDecisionLog().some(e => !e.confidenceRewardApplied);
        if (!stillPending) markAlgorithmStable();
      } catch (error) {
        console.error('[HCD Silent Tracker]', error);
      }
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [
    enabled,
    portfolioData.balancesReady,
    portfolioData.totalEthPortfolio,
    portfolioData.totalSolPortfolio,
    portfolioData.ethBaseline.totalUsd,
    portfolioData.solBaseline.totalUsd,
    usdcDebt,
    pendingCount,
  ]);
}

/** @deprecated Use useHcdSilentTrackerState + useHcdSilentTrackerEngine */
export function useHcdSilentTracker(portfolioData: PortfolioData, usdcDebt: number) {
  useHcdSilentTrackerEngine(portfolioData, usdcDebt, true);
  return useHcdSilentTrackerState();
}

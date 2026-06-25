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
import {
  logCyborgDiagnostic,
  reportSilentTrackerFailure,
  reportSilentTrackerSuccess,
} from '@/lib/cyborgEngine';
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

function safePendingCount(): number {
  try {
    return loadDecisionLog().filter(e => !e.confidenceRewardApplied).length;
  } catch {
    return 0;
  }
}

/** Read-only state for HCD Learning Log — does not run background checks. */
export function useHcdSilentTrackerState() {
  const decisionLog = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return loadDecisionLog();
      } catch {
        return [];
      }
    },
    () => [],
  );
  const calibration = useSyncExternalStore(
    subscribe,
    () => {
      try {
        return loadStrategyCalibration();
      } catch {
        return DEFAULT_CALIBRATION();
      }
    },
    DEFAULT_CALIBRATION,
  );
  return { decisionLog, calibration };
}

/**
 * Background 24h PnL engine — deferred, non-blocking, failure-isolated.
 * Participates in CyborgEngine phase lifecycle (idle → loading → ready / error / fallback).
 */
export function useHcdSilentTrackerEngine(
  portfolioData: PortfolioData | null | undefined,
  usdcDebt: number,
  enabled: boolean,
  restartToken = 0,
) {
  const pendingCount = useSyncExternalStore(subscribe, safePendingCount, () => 0);

  const ethUsd = portfolioData?.ethBaseline?.totalUsd ?? 0;
  const solUsd = portfolioData?.solBaseline?.totalUsd ?? 0;
  const balancesReady = portfolioData?.balancesReady ?? true;

  useEffect(() => {
    if (!enabled || !balancesReady) {
      logCyborgDiagnostic('SilentTracker: waiting for portfolio', { enabled, balancesReady });
      return;
    }

    logCyborgDiagnostic('SilentTracker: scheduling run', { restartToken });

    const timeoutId = window.setTimeout(() => {
      try {
        if (!portfolioData) return;
        const snapshot = capturePortfolioSnapshot(portfolioData, usdcDebt);
        if (
          snapshot.totalUsd <= 0
          && (portfolioData?.totalEthPortfolio ?? 0) <= 0
          && (portfolioData?.totalSolPortfolio ?? 0) <= 0
        ) {
          logCyborgDiagnostic('SilentTracker: empty snapshot — skipping');
          return;
        }

        if (pendingCount > 0) setAlgorithmCalibrating();

        processSilentPerformanceChecks(snapshot);

        const stillPending = safePendingCount() > 0;
        if (!stillPending) markAlgorithmStable();

        reportSilentTrackerSuccess();
        logCyborgDiagnostic('SilentTracker: run complete');
      } catch (error) {
        reportSilentTrackerFailure(error);
        logCyborgDiagnostic('SilentTracker: run failed', error);
      }
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [
    enabled,
    balancesReady,
    portfolioData?.totalEthPortfolio,
    portfolioData?.totalSolPortfolio,
    ethUsd,
    solUsd,
    usdcDebt,
    pendingCount,
    restartToken,
  ]);
}

/** @deprecated Use useHcdSilentTrackerState + useHcdSilentTrackerEngine */
export function useHcdSilentTracker(portfolioData: PortfolioData, usdcDebt: number) {
  useHcdSilentTrackerEngine(portfolioData, usdcDebt, true);
  return useHcdSilentTrackerState();
}

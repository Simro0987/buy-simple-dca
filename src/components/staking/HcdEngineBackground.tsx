import { useEffect } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCyborgEngine } from '@/hooks/useCyborgEngine';
// import { useHcdSilentTrackerEngine } from '@/hooks/useHcdSilentTracker';
import { hardResetCyborgEngineForStakeMount } from '@/lib/cyborgEngine';
// import { ensurePortfolioData, getAggregatedPortfolioTotals } from '@/lib/portfolioData';
import { StakeErrorBoundary } from '@/components/staking/StakeErrorBoundary';

/**
 * Runs HCD autonomous engine fully off the UI render path.
 * Renders nothing — failures are logged only and never block Stake dashboard.
 */
function HcdEngineBackgroundInner() {
  usePortfolio();

  useEffect(() => {
    hardResetCyborgEngineForStakeMount();
  }, []);

  const { restartToken: _restartToken } = useCyborgEngine();
  void _restartToken;

  // HARD DISABLE: useHcdSilentTrackerEngine causes fatal Stake crash — re-enable after stabilization
  // const safePortfolio = ensurePortfolioData(portfolioData);
  // const { ethQty, solQty } = getAggregatedPortfolioTotals(safePortfolio);
  // useHcdSilentTrackerEngine(
  //   safePortfolio,
  //   cyborgUsdcDebt ?? 0,
  //   ethQty > 0 || solQty > 0,
  //   restartToken,
  // );

  return null;
}

export function HcdEngineBackground() {
  return (
    <StakeErrorBoundary fallback={null}>
      <HcdEngineBackgroundInner />
    </StakeErrorBoundary>
  );
}

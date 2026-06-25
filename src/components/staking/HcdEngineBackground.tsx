import { useEffect } from 'react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { useCyborgEngine } from '@/hooks/useCyborgEngine';
import { useHcdSilentTrackerEngine } from '@/hooks/useHcdSilentTracker';
import { hardResetCyborgEngineForStakeMount } from '@/lib/cyborgEngine';
import { getAggregatedPortfolioTotals } from '@/lib/portfolioData';
import { StakeErrorBoundary } from '@/components/staking/StakeErrorBoundary';

/**
 * Runs HCD autonomous engine fully off the UI render path.
 * Renders nothing — failures are logged only and never block Stake dashboard.
 */
function HcdEngineBackgroundInner() {
  const { portfolioData, cyborgUsdcDebt } = usePortfolio();

  useEffect(() => {
    hardResetCyborgEngineForStakeMount();
  }, []);

  const { restartToken } = useCyborgEngine();

  const { ethQty, solQty } = getAggregatedPortfolioTotals(portfolioData);
  useHcdSilentTrackerEngine(
    portfolioData,
    cyborgUsdcDebt,
    ethQty > 0 || solQty > 0,
    restartToken,
  );

  return null;
}

export function HcdEngineBackground() {
  return (
    <StakeErrorBoundary fallback={null}>
      <HcdEngineBackgroundInner />
    </StakeErrorBoundary>
  );
}

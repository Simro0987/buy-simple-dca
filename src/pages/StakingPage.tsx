import { Lang } from '@/lib/i18n';
import { HcdStakePanel } from '@/components/staking/HcdStakePanel';
import { StakeErrorBoundary } from '@/components/staking/StakeErrorBoundary';
import { PortfolioProvider } from '@/contexts/PortfolioContext';
import { StakingApyProvider } from '@/contexts/StakingApyContext';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';

interface Props { lang: Lang; }

function StakingPageContent({ lang, marketScore }: { lang: Lang; marketScore: number }) {
  const sk = lang === 'sk';

  return (
    <StakeErrorBoundary
      fallback={(
        <div className="glass-card p-4 border border-amber-500/40 bg-amber-500/5 text-sm text-amber-100">
          {sk ? 'UI vrstvy dočasne nedostupné' : 'Layer UI temporarily unavailable'}
        </div>
      )}
    >
      <div className="pb-4">
        <HcdStakePanel lang={lang} marketScore={marketScore} />
      </div>
    </StakeErrorBoundary>
  );
}

export function StakingPage({ lang }: Props) {
  const { data: prices } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { data: athData } = useAthData();
  const { data: altSeason } = useAltSeason();
  const cycleResult = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });

  return (
    <PortfolioProvider>
      <StakingApyProvider>
        <StakingPageContent lang={lang} marketScore={cycleResult?.score ?? 50} />
      </StakingApyProvider>
    </PortfolioProvider>
  );
}

import { Lang } from '@/lib/i18n';
import { HcdStakePanel } from '@/components/staking/HcdStakePanel';
import { DeFiCyborgTerminal } from '@/components/staking/DeFiCyborgTerminal';
import { StakeErrorBoundary } from '@/components/staking/StakeErrorBoundary';
import { PortfolioProvider, usePortfolio } from '@/contexts/PortfolioContext';
import { StakingApyProvider } from '@/contexts/StakingApyContext';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';

interface Props { lang: Lang; }

function StakingPageContent({ lang, marketScore }: { lang: Lang; marketScore: number }) {
  const { portfolioData } = usePortfolio();
  const sk = lang === 'sk';

  return (
    <StakeErrorBoundary message={sk ? 'Chyba pri načítaní dát.' : 'Error loading data.'}>
      <div className="space-y-4 pb-4">
        <HcdStakePanel lang={lang} marketScore={marketScore} />
        <DeFiCyborgTerminal lang={lang} portfolioData={portfolioData} />
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

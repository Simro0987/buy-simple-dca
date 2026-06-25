import { useRef, useState } from 'react';
import { Lang } from '@/lib/i18n';
import { HcdStakePanel } from '@/components/staking/HcdStakePanel';
import { StakeErrorBoundary } from '@/components/staking/StakeErrorBoundary';
import { StakePortfolioFallback } from '@/components/staking/StakePortfolioFallback';
import { PortfolioProvider } from '@/contexts/PortfolioContext';
import { StakingApyProvider } from '@/contexts/StakingApyContext';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';

interface Props { lang: Lang; }

function StakingPageContent({ lang, marketScore }: { lang: Lang; marketScore: number }) {
  const sk = lang === 'sk';
  const [panelKey, setPanelKey] = useState(0);
  const restartRef = useRef<(() => Promise<void>) | null>(null);

  const handleFullRestart = async () => {
    setPanelKey(k => k + 1);
    await restartRef.current?.();
  };

  return (
    <StakeErrorBoundary
      message={sk ? 'Chyba pri načítaní dát.' : 'Error loading data.'}
      onRetry={handleFullRestart}
      fallback={(
        <StakePortfolioFallback
          lang={lang}
          notice={sk
            ? 'HCD panel dočasne nedostupný — zobrazujeme uložené zostatky z Portfólia.'
            : 'HCD panel temporarily unavailable — showing cached Portfolio balances.'}
        />
      )}
    >
      <div className="pb-4">
        <HcdStakePanel
          key={`hcd-panel-${panelKey}`}
          lang={lang}
          marketScore={marketScore}
          onRestartReady={(restart) => { restartRef.current = restart; }}
        />
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

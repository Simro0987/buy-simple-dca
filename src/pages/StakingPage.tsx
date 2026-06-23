import { Lang } from '@/lib/i18n';
import { IdleStakeShortcuts } from '@/components/dashboard/IdleStakeShortcuts';
import { PortfolioProvider } from '@/contexts/PortfolioContext';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';

interface Props { lang: Lang; }

export function StakingPage({ lang }: Props) {
  const { data: prices } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { data: athData } = useAthData();
  const { data: altSeason } = useAltSeason();
  const cycleResult = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });

  return (
    <PortfolioProvider>
      <IdleStakeShortcuts lang={lang} marketScore={cycleResult?.score ?? 50} />
    </PortfolioProvider>
  );
}

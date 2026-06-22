import { Lang } from '@/lib/i18n';
import { PriceData, AthData } from '@/lib/crypto';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { AdvancedMarketData } from '@/hooks/useAdvancedMarket';
import { PortfolioPage } from '@/pages/PortfolioPage';

interface Props {
  lang: Lang;
  prices?: PriceData | undefined;
  athData?: AthData | undefined;
  cycleResult?: MarketCycleResult | undefined;
  advancedMarketData?: AdvancedMarketData | undefined;
}

/** Portfólio + profit sekcia — deleguje na PortfolioPage → ModernPortfolioPage */
export function PortfolioProfitPage({ lang }: Props) {
  return <PortfolioPage lang={lang} />;
}

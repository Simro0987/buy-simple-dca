import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Lang } from '@/lib/i18n';
import { PriceData, AthData } from '@/lib/crypto';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { AdvancedMarketData } from '@/hooks/useAdvancedMarket';

const PortfolioPage = lazy(() => import('@/pages/PortfolioPage').then(m => ({ default: m.PortfolioPage })));
const ProfitTakingPage = lazy(() => import('@/pages/ProfitTakingPage').then(m => ({ default: m.ProfitTakingPage })));

const Fallback = () => (
  <div className="space-y-3">
    <Skeleton className="h-8 w-2/3" />
    <Skeleton className="h-32 w-full" />
  </div>
);

interface Props {
  lang: Lang;
  prices: PriceData | undefined;
  athData: AthData | undefined;
  cycleResult: MarketCycleResult | undefined;
  advancedMarketData: AdvancedMarketData | undefined;
}

export function PortfolioProfitPage({ lang, prices, athData, cycleResult, advancedMarketData }: Props) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<Fallback />}><PortfolioPage lang={lang} /></Suspense>
      <Suspense fallback={<Fallback />}>
        <ProfitTakingPage lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} advancedData={advancedMarketData} />
      </Suspense>
    </div>
  );
}

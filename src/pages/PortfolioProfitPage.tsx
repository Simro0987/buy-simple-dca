import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Lang } from '@/lib/i18n';
import { PriceData, AthData } from '@/lib/crypto';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { AdvancedMarketData } from '@/hooks/useAdvancedMarket';

const ModernPortfolioPage = lazy(() =>
  import('@/pages/ModernPortfolioPage').then(m => ({ default: m.ModernPortfolioPage })),
);

const Fallback = () => (
  <div className="space-y-4">
    <Skeleton className="h-16 w-full bg-white/5 rounded-3xl" />
    <Skeleton className="h-48 w-full bg-white/5 rounded-3xl" />
    <Skeleton className="h-64 w-full bg-white/5 rounded-3xl" />
  </div>
);

interface Props {
  lang: Lang;
  prices: PriceData | undefined;
  athData: AthData | undefined;
  cycleResult: MarketCycleResult | undefined;
  advancedMarketData: AdvancedMarketData | undefined;
}

export function PortfolioProfitPage({ lang }: Props) {
  return (
    <Suspense fallback={<Fallback />}>
      <ModernPortfolioPage lang={lang} />
    </Suspense>
  );
}

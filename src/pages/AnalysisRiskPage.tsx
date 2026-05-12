import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Lang } from '@/lib/i18n';
import { PriceData, AthData } from '@/lib/crypto';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { Shield } from 'lucide-react';

const RiskDashboard = lazy(() => import('@/components/RiskDashboard').then(m => ({ default: m.RiskDashboard })));
const AnalysisPage = lazy(() => import('@/pages/AnalysisPage').then(m => ({ default: m.AnalysisPage })));
const AdvancedMarketPage = lazy(() => import('@/pages/AdvancedMarketPage').then(m => ({ default: m.AdvancedMarketPage })));

const Fallback = () => (
  <div className="space-y-3">
    <Skeleton className="h-8 w-2/3" />
    <Skeleton className="h-32 w-full" />
  </div>
);

interface Props {
  lang: Lang;
  prices?: PriceData;
  athData?: AthData;
  cycleResult?: MarketCycleResult | null;
}

export function AnalysisRiskPage({ lang, prices, athData, cycleResult }: Props) {
  const sk = lang === 'sk';
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
          <Shield className="w-6 h-6" />
          {sk ? 'Analýza & Riziko' : 'Analysis & Risk'}
        </h1>
        <p className="text-xs text-muted-foreground">
          {sk
            ? 'Zjednotený pohľad: cyklus, riziká tokenov, technická a pokročilá trhová analýza.'
            : 'Unified view: cycle, token risk, technical and advanced market analysis.'}
        </p>
      </div>

      <Suspense fallback={<Fallback />}>
        <RiskDashboard lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} />
      </Suspense>

      <Suspense fallback={<Fallback />}>
        <AnalysisPage lang={lang} />
      </Suspense>

      <Suspense fallback={<Fallback />}>
        <AdvancedMarketPage lang={lang} />
      </Suspense>
    </div>
  );
}

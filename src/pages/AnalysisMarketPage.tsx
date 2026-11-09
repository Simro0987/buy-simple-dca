import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Lang } from '@/lib/i18n';

const AnalysisPage = lazy(() => import('@/pages/AnalysisPage').then(m => ({ default: m.AnalysisPage })));
const AdvancedMarketPage = lazy(() => import('@/pages/AdvancedMarketPage').then(m => ({ default: m.AdvancedMarketPage })));

const Fallback = () => (
  <div className="space-y-3">
    <Skeleton className="h-8 w-2/3" />
    <Skeleton className="h-32 w-full" />
  </div>
);

export function AnalysisMarketPage({ lang }: { lang: Lang }) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<Fallback />}><AnalysisPage lang={lang} /></Suspense>
      <Suspense fallback={<Fallback />}><AdvancedMarketPage lang={lang} /></Suspense>
    </div>
  );
}

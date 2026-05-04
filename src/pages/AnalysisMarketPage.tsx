import { lazy, Suspense } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    <Tabs defaultValue="analysis" className="w-full">
      <TabsList className="grid w-full grid-cols-2 mb-4">
        <TabsTrigger value="analysis">{lang === 'sk' ? 'Analýza' : 'Analysis'}</TabsTrigger>
        <TabsTrigger value="market">{lang === 'sk' ? 'Trh' : 'Market'}</TabsTrigger>
      </TabsList>
      <TabsContent value="analysis">
        <Suspense fallback={<Fallback />}><AnalysisPage lang={lang} /></Suspense>
      </TabsContent>
      <TabsContent value="market">
        <Suspense fallback={<Fallback />}><AdvancedMarketPage lang={lang} /></Suspense>
      </TabsContent>
    </Tabs>
  );
}

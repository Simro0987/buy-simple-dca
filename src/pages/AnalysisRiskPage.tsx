import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Lang } from '@/lib/i18n';
import { PriceData, AthData } from '@/lib/crypto';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { Shield } from 'lucide-react';
import { MissionControlActions } from '@/components/analysis/MissionControlActions';
import { CounterpartyRiskCard } from '@/components/analysis/CounterpartyRiskCard';
import { PortfolioProvider } from '@/contexts/PortfolioContext';
import { Collapsible } from '@/components/ui/collapsible-section';

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
    <PortfolioProvider>
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-1">
        <h1 className="text-xl font-extrabold text-foreground flex items-center gap-2">
          <Shield className="w-6 h-6" />
          {sk ? 'Trh & Riziko' : 'Market & Risk'}
        </h1>
        <p className="text-xs text-muted-foreground">
          {sk
            ? 'Technická analýza, cyklus a riziká na jednom mieste. Všetky akcie sú manuálne.'
            : 'Technical analysis, cycle and risks in one place. All actions are manual.'}
        </p>
      </div>

      <MissionControlActions lang={lang} cycleResult={cycleResult} />

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Suspense fallback={<Fallback />}>
          <RiskDashboard lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} />
        </Suspense>
        <Suspense fallback={<Fallback />}>
          <AnalysisPage lang={lang} />
        </Suspense>
      </div>

      <Collapsible title={sk ? 'Pokročilá analýza trhu' : 'Advanced market analysis'} subtitle={sk ? 'Funding, dominancia, kalendár, inštitúcie' : 'Funding, dominance, calendar, institutions'}>
        <Suspense fallback={<Fallback />}>
          <AdvancedMarketPage lang={lang} />
        </Suspense>
      </Collapsible>

      <Collapsible title={sk ? 'Riziko protistrany (staking)' : 'Counterparty risk (staking)'}>
        <CounterpartyRiskCard lang={lang} />
      </Collapsible>
    </div>
    </PortfolioProvider>
  );
}

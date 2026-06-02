import { lazy, Suspense } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Lang } from '@/lib/i18n';
import { PriceData, AthData } from '@/lib/crypto';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { Shield } from 'lucide-react';
import { MissionControlActions } from '@/components/analysis/MissionControlActions';
import { CounterpartyRiskCard } from '@/components/analysis/CounterpartyRiskCard';
import { PortfolioProvider } from '@/contexts/PortfolioContext';

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
        <h1 className="text-2xl font-extrabold text-foreground flex items-center gap-2">
          <Shield className="w-6 h-6" />
          {sk ? 'Analýza & Riziko — Mission Control' : 'Analysis & Risk — Mission Control'}
        </h1>
        <p className="text-xs text-muted-foreground">
          {sk
            ? 'Centrálne velenie pre Portfólio, DCA, Swap a Stake. Všetky akcie sú manuálne.'
            : 'Central command for Portfolio, DCA, Swap and Stake. All actions are manual.'}
        </p>
      </div>

      {/* 1. ANALÝZA CORE — at the absolute top per spec */}
      <Suspense fallback={<Fallback />}>
        <AnalysisPage lang={lang} />
      </Suspense>

      {/* 2. Cross-module CTA pipeline */}
      <MissionControlActions lang={lang} cycleResult={cycleResult} />

      {/* 3. Risk & Cycle dashboard */}
      <Suspense fallback={<Fallback />}>
        <RiskDashboard lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} />
      </Suspense>

      {/* 4. Staking counterparty risk */}
      <CounterpartyRiskCard lang={lang} />

      {/* 5. Advanced market analysis */}
      <Suspense fallback={<Fallback />}>
        <AdvancedMarketPage lang={lang} />
      </Suspense>
    </div>
  );
}

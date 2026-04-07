import { useState } from 'react';
import { BottomNav, TabId } from '@/components/BottomNav';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { OverviewPage } from '@/pages/OverviewPage';
import { DCAPage } from '@/pages/DCAPage';
import { PortfolioPage } from '@/pages/PortfolioPage';
import { ActionPage } from '@/pages/ActionPage';
import { SmartAllocPage } from '@/pages/SmartAllocPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AnalysisPage } from '@/pages/AnalysisPage';
import { ExecutionTracker } from '@/components/ExecutionTracker';
import { WeeklyChecklist } from '@/components/WeeklyChecklist';
import { RiskDashboard } from '@/components/RiskDashboard';
import { usePriceAlerts } from '@/hooks/usePriceAlerts';

const Index = () => {
  const [tab, setTab] = useState<TabId>('overview');
  const { lang, toggleLang } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { data: prices } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { data: athData } = useAthData();
  const { data: altSeason } = useAltSeason();
  const cycleResult = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });
  usePriceAlerts(prices, lang);

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-4 pb-24">
        {tab === 'overview' && <OverviewPage lang={lang} />}
        {tab === 'portfolio' && <PortfolioPage lang={lang} />}
        {tab === 'dca' && <DCAPage lang={lang} />}
        {tab === 'smart' && <SmartAllocPage lang={lang} />}
        {tab === 'action' && <ActionPage lang={lang} />}
        {tab === 'checklist' && <WeeklyChecklist lang={lang} prices={prices} />}
        {tab === 'execution' && <ExecutionTracker lang={lang} prices={prices} />}
        {tab === 'risk' && <RiskDashboard lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} />}
        {tab === 'analysis' && <AnalysisPage lang={lang} />}
        {tab === 'settings' && <SettingsPage lang={lang} toggleLang={toggleLang} />}
      </main>
      <BottomNav active={tab} onChange={setTab} lang={lang} />
    </div>
  );
};

export default Index;

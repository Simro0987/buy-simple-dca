import { useState } from 'react';
import { BottomNav, TabId } from '@/components/BottomNav';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { OverviewPage } from '@/pages/OverviewPage';
import { DCAPage } from '@/pages/DCAPage';
import { ActionPage } from '@/pages/ActionPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ExecutionTracker } from '@/components/ExecutionTracker';
import { WeeklyChecklist } from '@/components/WeeklyChecklist';
import { RiskDashboard } from '@/components/RiskDashboard';

const Index = () => {
  const [tab, setTab] = useState<TabId>('overview');
  const { lang, toggleLang } = useLanguage();
  const { data: prices } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { data: athData } = useAthData();
  const { data: altSeason } = useAltSeason();
  const cycleResult = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });

  return (
    <div className="min-h-screen bg-background">
      <main className="max-w-lg mx-auto px-4 pt-4 pb-24">
        {tab === 'overview' && <OverviewPage lang={lang} />}
        {tab === 'dca' && <DCAPage lang={lang} />}
        {tab === 'action' && <ActionPage lang={lang} />}
        {tab === 'checklist' && <WeeklyChecklist lang={lang} prices={prices} />}
        {tab === 'execution' && <ExecutionTracker lang={lang} prices={prices} />}
        {tab === 'risk' && <RiskDashboard lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} />}
        {tab === 'settings' && <SettingsPage lang={lang} toggleLang={toggleLang} />}
      </main>
      <BottomNav active={tab} onChange={setTab} lang={lang} />
    </div>
  );
};

export default Index;

import { ComponentType } from 'react';
import { TabId } from '@/components/BottomNav';
import { Lang } from '@/lib/i18n';
import { OverviewPage } from '@/pages/OverviewPage';
import { DCAPage } from '@/pages/DCAPage';
import { PortfolioPage } from '@/pages/PortfolioPage';
import { ActionPage } from '@/pages/ActionPage';
import { SmartAllocPage } from '@/pages/SmartAllocPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { AnalysisPage } from '@/pages/AnalysisPage';
import { AdvancedMarketPage } from '@/pages/AdvancedMarketPage';
import { ProfitTakingPage } from '@/pages/ProfitTakingPage';
import { StakingPage } from '@/pages/StakingPage';
import { ExecutionTracker } from '@/components/ExecutionTracker';
import { WeeklyChecklist } from '@/components/WeeklyChecklist';
import { RiskDashboard } from '@/components/RiskDashboard';

export interface TabContext {
  lang: Lang;
  prices: unknown;
  athData: unknown;
  cycleResult: unknown;
  advancedMarketData: unknown;
  theme: string;
  setTheme: (t: string) => void;
  toggleLang: () => void;
}

export type TabRenderer = (ctx: TabContext) => JSX.Element;

export const TAB_ROUTES: Record<TabId, TabRenderer> = {
  overview: ({ lang }) => <OverviewPage lang={lang} />,
  portfolio: ({ lang }) => <PortfolioPage lang={lang} />,
  dca: ({ lang }) => <DCAPage lang={lang} />,
  smart: ({ lang }) => <SmartAllocPage lang={lang} />,
  action: ({ lang }) => <ActionPage lang={lang} />,
  checklist: ({ lang, prices }) => <WeeklyChecklist lang={lang} prices={prices} />,
  execution: ({ lang, prices }) => <ExecutionTracker lang={lang} prices={prices} />,
  risk: ({ lang, prices, athData, cycleResult }) => (
    <RiskDashboard lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} />
  ),
  analysis: ({ lang }) => <AnalysisPage lang={lang} />,
  market: ({ lang }) => <AdvancedMarketPage lang={lang} />,
  profit: ({ lang, prices, athData, cycleResult, advancedMarketData }) => (
    <ProfitTakingPage lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} advancedData={advancedMarketData} />
  ),
  staking: ({ lang }) => <StakingPage lang={lang} />,
  settings: ({ lang, toggleLang, theme, setTheme }) => (
    <SettingsPage lang={lang} toggleLang={toggleLang} theme={theme} setTheme={setTheme} />
  ),
};

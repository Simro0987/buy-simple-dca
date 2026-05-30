import { lazy, Suspense } from 'react';
import { TabId } from '@/components/BottomNav';
import { Lang } from '@/lib/i18n';
import { PriceData, AthData } from '@/lib/crypto';
import { MarketCycleResult } from '@/hooks/useMarketCycle';
import { AdvancedMarketData } from '@/hooks/useAdvancedMarket';
import { Theme } from '@/hooks/useTheme';
import { Skeleton } from '@/components/ui/skeleton';

const OverviewPage = lazy(() => import('@/pages/OverviewPage').then(m => ({ default: m.OverviewPage })));
const DCAPage = lazy(() => import('@/pages/DCAPage').then(m => ({ default: m.DCAPage })));
const PortfolioProfitPage = lazy(() => import('@/pages/PortfolioProfitPage').then(m => ({ default: m.PortfolioProfitPage })));
const ActionPage = lazy(() => import('@/pages/ActionPage').then(m => ({ default: m.ActionPage })));
const SmartAllocPage = lazy(() => import('@/pages/SmartAllocPage').then(m => ({ default: m.SmartAllocPage })));
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const AnalysisRiskPage = lazy(() => import('@/pages/AnalysisRiskPage').then(m => ({ default: m.AnalysisRiskPage })));
const StakingPage = lazy(() => import('@/pages/StakingPage').then(m => ({ default: m.StakingPage })));
const WalletsPage = lazy(() => import('@/pages/WalletsPage').then(m => ({ default: m.WalletsPage })));
const AllocationCalculatorPage = lazy(() => import('@/pages/AllocationCalculatorPage').then(m => ({ default: m.AllocationCalculatorPage })));
const HomePage = lazy(() => import('@/pages/HomePage').then(m => ({ default: m.HomePage })));
const SwapPage = lazy(() => import('@/pages/SwapPage').then(m => ({ default: m.SwapPage })));
const ExecutionTracker = lazy(() => import('@/components/ExecutionTracker').then(m => ({ default: m.ExecutionTracker })));
const WeeklyChecklist = lazy(() => import('@/components/WeeklyChecklist').then(m => ({ default: m.WeeklyChecklist })));


export interface TabContext {
  lang: Lang;
  prices: PriceData | undefined;
  athData: AthData | undefined;
  cycleResult: MarketCycleResult | undefined;
  advancedMarketData: AdvancedMarketData | undefined;
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleLang: () => void;
  setTab: (tab: TabId) => void;
}

export type TabRenderer = (ctx: TabContext) => JSX.Element;

const Fallback = () => (
  <div className="space-y-3">
    <Skeleton className="h-8 w-2/3" />
    <Skeleton className="h-32 w-full" />
    <Skeleton className="h-32 w-full" />
  </div>
);

const wrap = (node: JSX.Element) => <Suspense fallback={<Fallback />}>{node}</Suspense>;

export const TAB_ROUTES: Record<TabId, TabRenderer> = {
  home: ({ setTab, lang }) => wrap(<HomePage onNavigate={setTab} lang={lang} />),
  overview: ({ lang }) => wrap(<OverviewPage lang={lang} />),
  portfolio: ({ lang, prices, athData, cycleResult, advancedMarketData }) => wrap(
    <PortfolioProfitPage lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} advancedMarketData={advancedMarketData} />
  ),
  dca: ({ lang }) => wrap(<DCAPage lang={lang} />),
  swap: ({ lang }) => wrap(<SwapPage lang={lang} />),
  risk: ({ lang, prices, athData, cycleResult }) => wrap(
    <AnalysisRiskPage lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} />
  ),
  analysis: ({ lang, prices, athData, cycleResult }) => wrap(
    <AnalysisRiskPage lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} />
  ),
  market: ({ lang, prices, athData, cycleResult }) => wrap(
    <AnalysisRiskPage lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} />
  ),
  profit: ({ lang, prices, athData, cycleResult, advancedMarketData }) => wrap(
    <PortfolioProfitPage lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} advancedMarketData={advancedMarketData} />
  ),
  staking: ({ lang }) => wrap(<StakingPage lang={lang} />),
  wallets: ({ lang }) => wrap(<WalletsPage lang={lang} />),
  allocator: ({ lang }) => wrap(<AllocationCalculatorPage lang={lang} />),
  settings: ({ lang, toggleLang, theme, setTheme }) => wrap(
    <SettingsPage lang={lang} toggleLang={toggleLang} theme={theme} setTheme={setTheme} />
  ),
};

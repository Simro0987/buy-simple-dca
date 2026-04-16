import { useState, useEffect, useMemo } from 'react';
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
import { AdvancedMarketPage } from '@/pages/AdvancedMarketPage';
import { useAdvancedMarket } from '@/hooks/useAdvancedMarket';
import { ProfitTakingPage } from '@/pages/ProfitTakingPage';
import { ExecutionTracker } from '@/components/ExecutionTracker';
import { WeeklyChecklist } from '@/components/WeeklyChecklist';
import { RiskDashboard } from '@/components/RiskDashboard';
import { usePriceAlerts } from '@/hooks/usePriceAlerts';
import { useUnreadHighImpact } from '@/hooks/useUnreadHighImpact';
import { TOKENS, formatUsd } from '@/lib/crypto';
import { RefreshCw } from 'lucide-react';

function loadHoldings(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}');
  } catch { return {}; }
}

const Index = () => {
  const [tab, setTab] = useState<TabId>('overview');
  const { lang, toggleLang } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { data: prices, refetch, isFetching } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { data: athData } = useAthData();
  const { data: altSeason } = useAltSeason();
  const cycleResult = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });
  const { data: advancedMarketData } = useAdvancedMarket();
  usePriceAlerts(prices, lang);
  const unreadNewsCount = useUnreadHighImpact(lang);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const totalValue = useMemo(() => {
    if (!prices) return 0;
    const holdings = loadHoldings();
    return TOKENS.reduce((sum, t) => {
      const qty = holdings[t.id] ?? 0;
      const price = prices[t.coingeckoId]?.usd ?? 0;
      return sum + qty * price;
    }, 0);
  }, [prices]);

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-lg mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="min-w-0">
            <h1 className="text-sm font-bold text-foreground truncate">Môj Crypto Dashboard</h1>
            <p className="text-[10px] text-muted-foreground">
              {now.toLocaleDateString('sk', { weekday: 'short', day: 'numeric', month: 'short' })} · {now.toLocaleTimeString('sk', { hour: '2-digit', minute: '2-digit' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Portfólio</p>
              <p className="text-sm font-bold text-foreground">{totalValue > 0 ? formatUsd(totalValue) : '—'}</p>
            </div>
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="p-2 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </header>

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
        {tab === 'market' && <AdvancedMarketPage lang={lang} />}
        {tab === 'profit' && <ProfitTakingPage lang={lang} prices={prices} athData={athData} cycleResult={cycleResult} advancedData={advancedMarketData} />}
        {tab === 'settings' && <SettingsPage lang={lang} toggleLang={toggleLang} theme={theme} setTheme={setTheme} />}
      </main>
      <BottomNav active={tab} onChange={setTab} lang={lang} unreadNewsCount={unreadNewsCount} />
    </div>
  );
};

export default Index;

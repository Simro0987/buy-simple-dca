import { useState, useEffect, useMemo } from 'react';
import { BottomNav, TabId } from '@/components/BottomNav';
import { AppHeader } from '@/components/AppHeader';
import { AppSidebar } from '@/components/AppSidebar';
import { GasWatchdogBanner } from '@/components/GasWatchdogBanner';
import { PinLock } from '@/components/PinLock';
import { isUnlocked } from '@/lib/pin';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { useAdvancedMarket } from '@/hooks/useAdvancedMarket';
import { usePriceAlerts } from '@/hooks/usePriceAlerts';
import { useDynamicLimits } from '@/hooks/useDynamicLimits';
import { useUnreadHighImpact } from '@/hooks/useUnreadHighImpact';
import { TOKENS } from '@/lib/crypto';
import { TAB_ROUTES } from '@/lib/tabRoutes';
import { TabPanel } from '@/components/deep-space/primitives';

function loadHoldings(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}');
  } catch { return {}; }
}

const Index = () => {
  const [unlocked, setUnlocked] = useState<boolean>(() => isUnlocked());
  const [tab, setTab] = useState<TabId>('home');
  const { lang, toggleLang } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { data: prices, refetch, isFetching } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { data: athData } = useAthData();
  const { data: altSeason } = useAltSeason();
  const cycleResult = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });
  const { data: advancedMarketData } = useAdvancedMarket();
  usePriceAlerts(prices, lang);
  useDynamicLimits();
  const unreadNewsCount = useUnreadHighImpact(lang);

  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<string>;
      const next = ce.detail as TabId | undefined;
      if (next) setTab(next);
    };
    window.addEventListener('app-navigate-tab', handler);
    return () => window.removeEventListener('app-navigate-tab', handler);
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

  if (!unlocked) {
    return <PinLock onUnlock={() => setUnlocked(true)} />;
  }

  const renderTab = TAB_ROUTES[tab] ?? TAB_ROUTES.home;

  return (
    <div className="min-h-screen bg-[#050505] relative overflow-x-hidden">

      {/* Deep Space ambient blobs */}
      <div className="fixed inset-0 pointer-events-none -z-10 overflow-hidden" aria-hidden="true">
        <div
          className="absolute -top-48 -left-48 w-[28rem] h-[28rem] rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, #9945FF 0%, transparent 65%)', opacity: 0.08 }}
        />
        <div
          className="absolute -top-32 right-0 w-80 h-80 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, #14F195 0%, transparent 65%)', opacity: 0.06 }}
        />
        <div
          className="absolute top-1/2 -right-40 w-96 h-96 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, #627EEA 0%, transparent 65%)', opacity: 0.05 }}
        />
        <div
          className="absolute bottom-0 -left-24 w-64 h-64 rounded-full blur-3xl"
          style={{ background: 'radial-gradient(circle, #FF007A 0%, transparent 65%)', opacity: 0.05 }}
        />
      </div>

      <AppSidebar active={tab} onChange={setTab} lang={lang} />

      <div className="md:pl-[52px]">
        <AppHeader now={now} totalValue={totalValue} isFetching={isFetching} onRefresh={() => refetch()} />
        <div className="max-w-lg mx-auto px-4 pt-2">
          <GasWatchdogBanner />
        </div>
        <main className="max-w-lg mx-auto px-4 pt-4 pb-24 md:pb-6">
          <TabPanel tabKey={tab}>
            {renderTab({ lang, prices, athData, cycleResult, advancedMarketData, theme, setTheme, toggleLang, setTab })}
          </TabPanel>
        </main>
      </div>

      <div className="md:hidden">
        <BottomNav active={tab} onChange={setTab} lang={lang} unreadNewsCount={unreadNewsCount} />
      </div>
    </div>
  );
};

export default Index;

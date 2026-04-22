import { useState, useEffect, useMemo } from 'react';
import { BottomNav, TabId } from '@/components/BottomNav';
import { AppHeader } from '@/components/AppHeader';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { useAdvancedMarket } from '@/hooks/useAdvancedMarket';
import { usePriceAlerts } from '@/hooks/usePriceAlerts';
import { useUnreadHighImpact } from '@/hooks/useUnreadHighImpact';
import { TOKENS } from '@/lib/crypto';
import { TAB_ROUTES } from '@/lib/tabRoutes';

function loadHoldings(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem('smart-alloc-holdings') || '{}');
  } catch { return {}; }
}

const Index = () => {
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

  const renderTab = TAB_ROUTES[tab];

  return (
    <div className="min-h-screen bg-background">
      <AppHeader now={now} totalValue={totalValue} isFetching={isFetching} onRefresh={() => refetch()} />
      <main className="max-w-lg mx-auto px-4 pt-4 pb-24">
        {renderTab({ lang, prices, athData, cycleResult, advancedMarketData, theme, setTheme, toggleLang, setTab })}
      </main>
      <BottomNav active={tab} onChange={setTab} lang={lang} unreadNewsCount={unreadNewsCount} />
    </div>
  );
};

export default Index;

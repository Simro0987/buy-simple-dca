import { formatUsd } from '@/lib/crypto';
import { TokenCardCarousel } from '@/components/TokenCardCarousel';
import { MarketCycleGauge } from '@/components/MarketCycleGauge';
import { PortfolioHeatMap } from '@/components/PortfolioHeatMap';
import { BtcAccumulationCard } from '@/components/BtcAccumulationCard';
import { CryptoNewsFeed } from '@/components/CryptoNewsFeed';
import { PortfolioHistoryChart } from '@/components/PortfolioHistoryChart';
import { HighImpactNewsBanner } from '@/components/HighImpactNewsBanner';
import { RebalanceCard } from '@/components/RebalanceCard';
import { PortfolioProvider } from '@/contexts/PortfolioContext';
// IdleStakeShortcuts moved to StakingPage (governs staking workflow natively).
import { usePrices, useFearGreed, useAthData, useAltSeason, useSparklines } from '@/hooks/usePrices';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { Lang, t } from '@/lib/i18n';
import { RefreshCw, ChevronRight, TrendingDown, Plus } from 'lucide-react';
import { navigateToTab } from '@/lib/pendingActions';
import { toast } from 'sonner';

interface Props { lang: Lang; }

export function OverviewPage({ lang }: Props) {
  const sk = lang === 'sk';
  const { data: prices, isLoading, dataUpdatedAt, refetch, isFetching } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { data: athData } = useAthData();
  const { data: sparklines } = useSparklines();
  const { data: altSeason } = useAltSeason();
  const cycleResult = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });

  const totalInvested = parseFloat(localStorage.getItem('total-invested') || '0');
  const btcPrice = prices?.bitcoin?.usd ?? 0;

  const isBuyZone = (cycleResult?.score ?? 50) <= 25;

  return (
    <PortfolioProvider>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-foreground">{t('myPortfolio', lang)}</h1>
            {totalInvested > 0 && (
              <p className="text-lg font-semibold text-muted-foreground">{formatUsd(totalInvested)}</p>
            )}
          </div>
          <button
            onClick={() => refetch()}
            className="p-2 rounded-lg bg-secondary text-secondary-foreground"
            aria-label="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {dataUpdatedAt > 0 && (
          <p className="text-xs text-muted-foreground">
            {t('lastUpdate', lang)}: {new Date(dataUpdatedAt).toLocaleTimeString()}
          </p>
        )}

        {/* High Impact News Banner */}
        <HighImpactNewsBanner lang={lang} />

        {/* Market Cycle Score — CLICKABLE → Mission Control (Analýza & Riziko) */}
        {cycleResult && (
          <button
            type="button"
            onClick={() => navigateToTab('analysis')}
            className="block w-full text-left rounded-2xl focus:outline-none focus-visible:ring-2 focus-visible:ring-primary active:scale-[0.99] transition-transform"
            aria-label={sk ? 'Otvoriť Mission Control' : 'Open Mission Control'}
          >
            <div className="relative">
              <MarketCycleGauge result={cycleResult} lang={lang} fearGreedValue={fearGreed?.value} />
              <div className="absolute top-3 right-3 inline-flex items-center gap-1 text-[10px] font-semibold text-primary bg-primary/10 border border-primary/30 px-2 py-0.5 rounded-full">
                {sk ? 'Mission Control' : 'Mission Control'}
                <ChevronRight className="w-3 h-3" />
              </div>
            </div>
          </button>
        )}

        {/* Helper DCA shortcut — injects Money Mode BUY when cycle is green */}
        <button
          onClick={() => {
            if (isBuyZone) {
              try {
                sessionStorage.setItem('dca-money-mode-hint', JSON.stringify({
                  mode: 'CAPITULATION', score: cycleResult?.score ?? 0, ts: Date.now(),
                }));
              } catch { /* ignore */ }
              toast.success(sk
                ? 'Money Mode BUY injectnutý → DCA tab'
                : 'Money Mode BUY injected → DCA tab');
            }
            navigateToTab('dca');
          }}
          className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold border transition active:scale-[0.98] ${
            isBuyZone
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40 animate-pulse'
              : 'bg-secondary text-foreground border-border hover:bg-secondary/80'
          }`}
        >
          {isBuyZone ? <TrendingDown className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {sk ? '+ Pomocná DCA stratégia' : '+ Helper DCA strategy'}
          {isBuyZone && (
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/30">
              BUY
            </span>
          )}
        </button>

        {/* Swipeable Token Cards */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="glass-card p-4 h-24 animate-pulse" />
            ))}
          </div>
        ) : (
          <TokenCardCarousel prices={prices} athData={athData} sparklines={sparklines} lang={lang} />
        )}

        {/* Idle staking shortcuts moved to Staking tab top section. */}

        {/* Portfolio History Chart */}
        <PortfolioHistoryChart lang={lang} prices={prices} />

        {/* Rebalancing Recommendations (Moje Pomery → Swap pipeline) */}
        <RebalanceCard lang={lang} prices={prices} />

        {/* Portfolio Heat Map */}
        <PortfolioHeatMap prices={prices} lang={lang} />

        {/* BTC Accumulation */}
        <BtcAccumulationCard btcPrice={btcPrice} lang={lang} />

        {/* Crypto News — strict portfolio + Big-Five sources */}
        <CryptoNewsFeed lang={lang} />
      </div>
    </PortfolioProvider>
  );
}

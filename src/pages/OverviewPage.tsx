import { TOKENS, formatUsd } from '@/lib/crypto';
import { TokenCardCarousel } from '@/components/TokenCardCarousel';
import { FearGreedGauge } from '@/components/FearGreedGauge';
import { AltSeasonWidget } from '@/components/AltSeasonWidget';
import { MarketBanner } from '@/components/MarketBanner';
import { MarketCycleGauge } from '@/components/MarketCycleGauge';
import { PortfolioHeatMap } from '@/components/PortfolioHeatMap';
import { BtcAccumulationCard } from '@/components/BtcAccumulationCard';
import { usePrices, useFearGreed, useAthData, useAltSeason } from '@/hooks/usePrices';
import { useMarketCycleScore } from '@/hooks/useMarketCycle';
import { Lang, t } from '@/lib/i18n';
import { RefreshCw } from 'lucide-react';

interface Props { lang: Lang; }

export function OverviewPage({ lang }: Props) {
  const { data: prices, isLoading, dataUpdatedAt, refetch, isFetching } = usePrices();
  const { data: fearGreed } = useFearGreed();
  const { data: athData } = useAthData();
  const { data: altSeason } = useAltSeason();
  const cycleResult = useMarketCycleScore({ fearGreed, altSeason, prices, athData, lang });

  // Calculate total portfolio value from localStorage invested amount
  const totalInvested = parseFloat(localStorage.getItem('total-invested') || '0');
  const btcPrice = prices?.bitcoin?.usd ?? 0;

  return (
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
        >
          <RefreshCw className={`w-4 h-4 ${isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {dataUpdatedAt > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('lastUpdate', lang)}: {new Date(dataUpdatedAt).toLocaleTimeString()}
        </p>
      )}

      {/* Bull/Bear Banner */}
      {fearGreed && (
        <MarketBanner fearGreedValue={fearGreed.value} lang={lang} />
      )}

      {/* Market Cycle Score */}
      {cycleResult && <MarketCycleGauge result={cycleResult} lang={lang} />}

      {/* Swipeable Token Cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-card p-4 h-24 animate-pulse" />
          ))}
        </div>
      ) : (
        <TokenCardCarousel prices={prices} athData={athData} lang={lang} />
      )}

      {/* Portfolio Heat Map */}
      <PortfolioHeatMap prices={prices} lang={lang} />

      {/* BTC Accumulation */}
      <BtcAccumulationCard btcPrice={btcPrice} lang={lang} />

      {/* Market Indicators */}
      <div className="grid grid-cols-1 gap-3">
        {fearGreed && (
          <FearGreedGauge
            value={fearGreed.value}
            label={fearGreed.classification}
            title={t('fearGreed', lang)}
          />
        )}
        {altSeason && (
          <AltSeasonWidget value={altSeason.value} label={altSeason.label} lang={lang} />
        )}
      </div>
    </div>
  );
}

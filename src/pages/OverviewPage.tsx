import { TOKENS } from '@/lib/crypto';
import { PriceCard } from '@/components/PriceCard';
import { FearGreedGauge } from '@/components/FearGreedGauge';
import { usePrices, useFearGreed } from '@/hooks/usePrices';
import { Lang, t } from '@/lib/i18n';
import { RefreshCw } from 'lucide-react';

interface Props { lang: Lang; }

export function OverviewPage({ lang }: Props) {
  const { data: prices, isLoading, dataUpdatedAt, refetch, isFetching } = usePrices();
  const { data: fearGreed } = useFearGreed();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-foreground">{t('overview', lang)}</h1>
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

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="glass-card p-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {TOKENS.map(token => {
            const p = prices?.[token.coingeckoId];
            return (
              <PriceCard
                key={token.id}
                token={token}
                price={p?.usd ?? 0}
                change24h={p?.usd_24h_change}
              />
            );
          })}
        </div>
      )}

      {fearGreed && (
        <FearGreedGauge
          value={fearGreed.value}
          label={fearGreed.classification}
          title={t('fearGreed', lang)}
        />
      )}
    </div>
  );
}

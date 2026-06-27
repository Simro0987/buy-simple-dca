import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Zap,
  Radio,
  Globe,
  Filter,
  AlertTriangle,
  RefreshCw,
  ExternalLink,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import { Lang } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { useInfiniteScrollSentinel } from '@/hooks/useInfiniteScrollSentinel';
import { getOverviewNewsItems, useOverviewNews } from '@/hooks/useOverviewNews';
import {
  NEWS_INITIAL_VISIBLE,
  NEWS_LOAD_MORE_COUNT,
  filterNewsByTab,
  formatNewsTimeAgo,
  splitTopStory,
  type NewsAsset,
  type NewsFilter,
  type NewsSentiment,
  type OverviewNewsItem,
} from '@/lib/overviewNews';

interface Props { lang: Lang }

const ASSET_CFG: Record<NewsAsset, { color: string; label: string; img: string | null }> = {
  BTC:   { color: '#F7931A', label: 'Bitcoin',  img: 'https://assets.coingecko.com/coins/images/1/small/bitcoin.png' },
  ETH:   { color: '#627EEA', label: 'Ethereum', img: 'https://assets.coingecko.com/coins/images/279/small/ethereum.png' },
  SOL:   { color: '#9945FF', label: 'Solana',   img: 'https://assets.coingecko.com/coins/images/4128/small/solana.png' },
  MAKRO: { color: '#14b8a6', label: 'Makro',    img: null },
};

const CAT_TAG: Record<NewsAsset, { bg: string; text: string; label: string }> = {
  BTC:   { bg: 'rgba(247,147,26,0.14)',  text: '#F7931A', label: 'Krypto' },
  ETH:   { bg: 'rgba(98,126,234,0.14)',  text: '#627EEA', label: 'Krypto' },
  SOL:   { bg: 'rgba(153,69,255,0.14)',  text: '#9945FF', label: 'Krypto' },
  MAKRO: { bg: 'rgba(20,184,166,0.14)',  text: '#14b8a6', label: 'Makro'  },
};

const FILTERS: { id: NewsFilter; label: string }[] = [
  { id: 'ALL',   label: 'Všetko' },
  { id: 'MAKRO', label: 'Makro'  },
  { id: 'BTC',   label: 'BTC'    },
  { id: 'ETH',   label: 'ETH'    },
  { id: 'SOL',   label: 'SOL'    },
];

function SentimentBadge({ sentiment, sk }: { sentiment?: NewsSentiment; sk: boolean }) {
  if (!sentiment) return null;

  const config = {
    bullish: { label: 'Bullish', icon: TrendingUp, className: 'text-green-400 bg-green-500/10 border border-green-500/25' },
    bearish: { label: 'Bearish', icon: TrendingDown, className: 'text-red-400 bg-red-500/10 border border-red-500/25' },
    neutral: { label: sk ? 'Neutrálne' : 'Neutral', icon: Minus, className: 'text-muted-foreground bg-white/[0.04] border border-white/[0.08]' },
  }[sentiment];

  const Icon = config.icon;
  return (
    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide inline-flex items-center gap-0.5 ${config.className}`}>
      <Icon className="w-2 h-2" />
      {config.label}
    </span>
  );
}

function TopStoryHeroSkeleton() {
  return (
    <div className="glass-card p-0 overflow-hidden">
      <Skeleton className="w-full h-36 rounded-none" />
      <div className="p-4 space-y-2.5">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-36 rounded-full" />
          <Skeleton className="h-5 w-12 rounded-full" />
        </div>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}

function NewsCardSkeleton() {
  return (
    <div className="glass-card p-3 space-y-2">
      <div className="flex items-start gap-2.5">
        <Skeleton className="w-5 h-5 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="flex gap-1.5">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-4 w-10 rounded-full" />
          </div>
          <Skeleton className="h-3.5 w-full" />
          <Skeleton className="h-3.5 w-4/5" />
          <Skeleton className="h-2.5 w-24" />
        </div>
      </div>
    </div>
  );
}

function TopStoryHero({ item, sk }: { item: OverviewNewsItem; sk: boolean }) {
  const assetCfg = ASSET_CFG[item.asset];
  const catTag = CAT_TAG[item.asset];

  const inner = (
    <div
      className="glass-card p-0 overflow-hidden ring-1 ring-white/10 border border-white/[0.08] shadow-[0_0_40px_-12px_rgba(251,146,60,0.35)]"
      style={{
        background: 'linear-gradient(145deg, rgba(22,28,42,0.98) 0%, rgba(15,20,32,0.95) 55%, rgba(12,16,28,0.98) 100%)',
      }}
    >
      {item.imageUrl ? (
        <div className="relative h-36 sm:h-44 overflow-hidden">
          <img
            src={item.imageUrl}
            alt=""
            className="w-full h-full object-cover opacity-90"
            onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(12,16,28,0.95)] via-[rgba(12,16,28,0.35)] to-transparent" />
        </div>
      ) : (
        <div
          className="h-24 sm:h-28 relative overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${assetCfg.color}22 0%, rgba(12,16,28,0.9) 70%)` }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-[rgba(12,16,28,0.9)] to-transparent" />
        </div>
      )}

      <div className="p-4 -mt-6 relative">
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/15 border border-orange-400/35 text-orange-300 uppercase tracking-wide">
            <span aria-hidden>🔥</span>
            {sk ? 'Dnešná Top Správa' : 'Top Story'}
          </span>

          <span
            className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
            style={{ background: catTag.bg, color: catTag.text }}
          >
            {catTag.label}
          </span>

          <span
            className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
            style={{ background: `${assetCfg.color}18`, color: assetCfg.color }}
          >
            {item.asset}
          </span>

          <SentimentBadge sentiment={item.sentiment} sk={sk} />

          <span className="text-[9px] text-muted-foreground/60 ml-auto tabular-nums">
            {formatNewsTimeAgo(item.publishedAt, sk)}
          </span>
        </div>

        <h2 className="text-[15px] sm:text-lg font-bold leading-snug text-foreground tracking-tight">
          {item.title}
        </h2>

        {item.detail && (
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed line-clamp-3">
            {item.detail}
          </p>
        )}

        <p className="text-[9px] text-muted-foreground/50 mt-2.5 flex items-center gap-1">
          <span className="w-1 h-1 rounded-full bg-orange-400/60 inline-block" />
          {item.source}
          {item.articleUrl && <ExternalLink className="w-2.5 h-2.5 ml-1 opacity-50" />}
        </p>
      </div>
    </div>
  );

  if (item.articleUrl) {
    return (
      <a href={item.articleUrl} target="_blank" rel="noopener noreferrer" className="block hover:opacity-95 transition-opacity">
        {inner}
      </a>
    );
  }

  return inner;
}

function NewsCard({ item, sk }: { item: OverviewNewsItem; sk: boolean }) {
  const isFlash = item.isFlashAlert;
  const assetCfg = ASSET_CFG[item.asset];
  const catTag = CAT_TAG[item.asset];

  const inner = (
    <div
      className={`glass-card p-3 transition-all ${
        isFlash
          ? 'ring-2 ring-yellow-500/50 border-amber-500/30 shadow-[0_0_24px_-6px_rgba(251,191,36,0.35)]'
          : ''
      }`}
      style={isFlash ? {
        borderColor: 'rgba(251,191,36,0.25)',
        background: 'rgba(15,20,32,0.92)',
      } : {}}
    >
      <div className="flex items-start gap-2.5">
        <div className="shrink-0 mt-0.5">
          {assetCfg.img ? (
            <img
              src={assetCfg.img}
              alt={item.asset}
              width={20}
              height={20}
              className="rounded-full"
              onError={e => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                if (next) next.style.display = 'flex';
              }}
            />
          ) : null}
          <div
            className={`${assetCfg.img ? 'hidden' : 'flex'} w-5 h-5 rounded-full items-center justify-center`}
            style={{ backgroundColor: `${assetCfg.color}22`, border: `1px solid ${assetCfg.color}40` }}
          >
            <Globe className="w-2.5 h-2.5" style={{ color: assetCfg.color }} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span
              className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
              style={{ background: catTag.bg, color: catTag.text }}
            >
              {catTag.label}
            </span>

            <span
              className="text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide"
              style={{ background: `${assetCfg.color}18`, color: assetCfg.color }}
            >
              {item.asset}
            </span>

            <SentimentBadge sentiment={item.sentiment} sk={sk} />

            {isFlash && (
              <span className="flex items-center gap-0.5 text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 uppercase tracking-wide animate-pulse">
                <Zap className="w-2 h-2" />
                {item.tag ?? 'FLASH'}
              </span>
            )}

            <span className="text-[8px] text-muted-foreground/50 ml-auto tabular-nums">
              {formatNewsTimeAgo(item.publishedAt, sk)}
            </span>
          </div>

          <p className={`text-[11px] font-semibold leading-snug ${isFlash ? 'text-amber-50' : 'text-foreground'}`}>
            {item.title}
          </p>

          {item.detail && (
            <p className="text-[9px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">{item.detail}</p>
          )}

          <p className="text-[8px] text-muted-foreground/40 mt-1.5 flex items-center gap-1">
            <span className="w-1 h-1 rounded-full bg-muted-foreground/30 inline-block" />
            {item.source}
            {item.articleUrl && (
              <ExternalLink className="w-2.5 h-2.5 ml-1 opacity-50" />
            )}
          </p>
        </div>

        {isFlash && (
          <div className="shrink-0 mt-1">
            <span className="block w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );

  if (item.articleUrl) {
    return (
      <a href={item.articleUrl} target="_blank" rel="noopener noreferrer" className="block hover:opacity-95">
        {inner}
      </a>
    );
  }

  return inner;
}

export function OverviewPage({ lang }: Props) {
  const sk = lang === 'sk';
  const [filter, setFilter] = useState<NewsFilter>('ALL');
  const [visibleCount, setVisibleCount] = useState(NEWS_INITIAL_VISIBLE);

  const {
    data,
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useOverviewNews(lang);

  const allNews = useMemo(() => getOverviewNewsItems(data), [data]);

  const filteredNews = useMemo(
    () => filterNewsByTab(allNews, filter),
    [allNews, filter],
  );

  useEffect(() => {
    if (data) {
      console.log('[Noviny] Aggregated news payload:', data);
    }
  }, [data]);

  useEffect(() => {
    console.log('[Noviny] Filtered articles:', { activeTab: filter, count: filteredNews.length, items: filteredNews });
  }, [filter, filteredNews]);

  const { topStory, remainingArticles, totalRemaining } = useMemo(() => {
    const { topStory: hero, remainingArticles: rest } = splitTopStory(filteredNews);

    const sortedRest = [...rest].sort((a, b) => {
      if (a.isFlashAlert !== b.isFlashAlert) return a.isFlashAlert ? -1 : 1;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return {
      topStory: hero,
      remainingArticles: sortedRest.slice(0, visibleCount),
      totalRemaining: sortedRest.length,
    };
  }, [filteredNews, visibleCount]);

  useEffect(() => {
    setVisibleCount(NEWS_INITIAL_VISIBLE);
  }, [filter]);

  const canRevealMore = visibleCount < totalRemaining;

  const handleLoadMore = useCallback(() => {
    if (canRevealMore) {
      setVisibleCount(count => count + NEWS_LOAD_MORE_COUNT);
    }
  }, [canRevealMore]);

  const sentinelRef = useInfiniteScrollSentinel({
    enabled: !isLoading && !isError && canRevealMore,
    onIntersect: handleLoadMore,
  });

  const flashCount = remainingArticles.filter(n => n.isFlashAlert).length;
  const isFeedLoading = isLoading || (isFetching && !data);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Radio className="w-4 h-4 text-primary" />
            Noviny
          </h1>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            Live feed · BTC, ETH, SOL
          </p>
        </div>
        <div className="flex items-center gap-2">
          {flashCount > 0 && (
            <span className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-500/12 border border-amber-500/25">
              <Zap className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] font-bold text-amber-400 tabular-nums">{flashCount} flash</span>
            </span>
          )}
          <button
            type="button"
            onClick={() => void refetch()}
            disabled={isFetching}
            className="p-1.5 rounded-lg hover:bg-white/[0.06] disabled:opacity-50"
            title={sk ? 'Obnoviť' : 'Refresh'}
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
        <Filter className="w-3 h-3 text-muted-foreground/40 shrink-0" />
        {FILTERS.map(f => {
          const cfg = f.id === 'ALL' ? null : ASSET_CFG[f.id as NewsAsset];
          const isActive = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="px-2.5 py-1 rounded-full text-[10px] font-semibold whitespace-nowrap transition-all shrink-0"
              style={{
                background: isActive
                  ? (cfg ? `${cfg.color}22` : 'rgba(34,197,94,0.15)')
                  : 'rgba(255,255,255,0.04)',
                border: isActive
                  ? `1px solid ${cfg ? cfg.color + '50' : 'rgba(34,197,94,0.4)'}`
                  : '1px solid rgba(255,255,255,0.07)',
                color: isActive
                  ? (cfg ? cfg.color : 'hsl(142 62% 40%)')
                  : 'rgba(255,255,255,0.45)',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {isFeedLoading && (
        <div className="space-y-2">
          <TopStoryHeroSkeleton />
          <div className="space-y-1.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <NewsCardSkeleton key={i} />
            ))}
          </div>
        </div>
      )}

      {isError && !isFeedLoading && (
        <div className="glass-card p-6 text-center space-y-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 mx-auto" />
          <p className="text-sm text-muted-foreground">
            {sk
              ? 'Nepodarilo sa načítať živé novinky. Skúste obnoviť alebo počkajte na reset limitu API.'
              : 'Failed to load live news. Try refreshing or wait for API rate limits to reset.'}
          </p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-primary/15 text-primary border border-primary/30"
          >
            {sk ? 'Skúsiť znova' : 'Try again'}
          </button>
        </div>
      )}

      {!isFeedLoading && !isError && (
        <div className="space-y-2">
          {topStory && <TopStoryHero item={topStory} sk={sk} />}

          {remainingArticles.length > 0 && (
            <div className="space-y-1.5">
              {remainingArticles.map(item => (
                <NewsCard key={item.id} item={item} sk={sk} />
              ))}
            </div>
          )}

          {!topStory && remainingArticles.length === 0 && (
            <div className="glass-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                {sk ? 'Žiadne správy pre tento filter.' : 'No articles for this filter.'}
              </p>
            </div>
          )}

          {canRevealMore && (
            <div ref={sentinelRef} className="space-y-1.5 pt-1">
              <NewsCardSkeleton />
              <p className="text-[9px] text-muted-foreground/40 text-center py-1">
                {sk ? 'Načítavam ďalšie správy…' : 'Loading more stories…'}
              </p>
            </div>
          )}

          {!canRevealMore && totalRemaining > NEWS_INITIAL_VISIBLE && (
            <p className="text-[9px] text-muted-foreground/30 text-center py-2">
              {sk ? 'Koniec feedu' : 'End of feed'}
            </p>
          )}
        </div>
      )}

      <p className="text-[9px] text-muted-foreground/30 text-center pb-2">
        {sk
          ? 'Zdroje: Cointelegraph · CoinDesk · The Block · CryptoCompare · CoinGecko'
          : 'Sources: Cointelegraph · CoinDesk · The Block · CryptoCompare · CoinGecko'}
      </p>
    </div>
  );
}

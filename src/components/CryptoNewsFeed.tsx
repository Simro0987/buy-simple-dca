import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Newspaper, AlertTriangle, TrendingUp, TrendingDown, Minus, ExternalLink, Zap, Activity, BarChart3 } from 'lucide-react';
import { useCryptoNews, NewsItem } from '@/hooks/useCryptoNews';
import { Lang } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';

interface Props {
  lang: Lang;
}

const TOKEN_COLORS: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
  HYPE: '#00D4AA',
};

function ImpactIcon({ impact }: { impact: NewsItem['impact'] }) {
  switch (impact) {
    case 'high': return <Zap className="w-3 h-3" />;
    case 'medium': return <Activity className="w-3 h-3" />;
    default: return <BarChart3 className="w-3 h-3" />;
  }
}

function impactBadge(impact: NewsItem['impact'], sk: boolean) {
  const config = {
    high: { label: sk ? 'Vysoký dopad' : 'High Impact', className: 'bg-red-500/20 text-red-400 border border-red-500/30' },
    medium: { label: sk ? 'Stredný' : 'Medium', className: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
    low: { label: sk ? 'Nízky' : 'Low', className: 'bg-secondary text-muted-foreground border border-border' },
  };
  const c = config[impact];
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${c.className}`}>
      <ImpactIcon impact={impact} />
      {c.label}
    </span>
  );
}

function sentimentBadge(sentiment: NewsItem['sentiment'], sk: boolean) {
  const config = {
    bullish: { label: 'Bullish', icon: TrendingUp, className: 'text-green-400 bg-green-500/10 border border-green-500/20' },
    bearish: { label: 'Bearish', icon: TrendingDown, className: 'text-red-400 bg-red-500/10 border border-red-500/20' },
    neutral: { label: sk ? 'Neutrálne' : 'Neutral', icon: Minus, className: 'text-muted-foreground bg-secondary border border-border' },
  };
  const c = config[sentiment];
  const Icon = c.icon;
  return (
    <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium inline-flex items-center gap-1 ${c.className}`}>
      <Icon className="w-2.5 h-2.5" />
      {c.label}
    </span>
  );
}

function timeAgo(dateStr: string, sk: boolean): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}${sk ? ' min' : 'm'}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}${sk ? ' hod' : 'h'}`;
  const days = Math.floor(hours / 24);
  return `${days}${sk ? ' d' : 'd'}`;
}

export function CryptoNewsFeed({ lang }: Props) {
  const sk = lang === 'sk';
  const { data: news, isLoading, isError } = useCryptoNews(undefined, lang);
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  const filtered = filter ? news?.filter(n => n.tokens.includes(filter)) : news;

  // Count items per token for badge counts
  const tokenCounts = news ? {
    BTC: news.filter(n => n.tokens.includes('BTC')).length,
    ETH: news.filter(n => n.tokens.includes('ETH')).length,
    SOL: news.filter(n => n.tokens.includes('SOL')).length,
    HYPE: news.filter(n => n.tokens.includes('HYPE')).length,
  } : {};

  // Count high-impact items
  const highCount = news?.filter(n => n.impact === 'high').length || 0;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="glass-card p-4 space-y-3">
        {/* Header */}
        <CollapsibleTrigger className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {sk ? 'Novinky z portfólia' : 'Portfolio News'}
            </span>
            {highCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/20 text-red-400 font-bold">
                {highCount} {sk ? 'dôležité' : 'important'}
              </span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3">
          {/* Token filters */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setFilter(null)}
              className={`text-[10px] px-2.5 py-1 rounded-full transition-colors font-medium ${
                !filter ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {sk ? 'Všetky' : 'All'} {news ? `(${news.length})` : ''}
            </button>
            {(['BTC', 'ETH', 'SOL', 'HYPE'] as const).map(token => {
              const count = tokenCounts[token] || 0;
              return (
                <button
                  key={token}
                  onClick={() => setFilter(filter === token ? null : token)}
                  className={`text-[10px] px-2.5 py-1 rounded-full transition-colors font-medium inline-flex items-center gap-1 ${
                    filter === token ? 'text-primary-foreground' : 'text-secondary-foreground hover:bg-secondary/80'
                  }`}
                  style={filter === token ? {
                    backgroundColor: TOKEN_COLORS[token],
                  } : {
                    backgroundColor: `${TOKEN_COLORS[token]}15`,
                    color: TOKEN_COLORS[token],
                  }}
                >
                  {token}
                  {count > 0 && <span className="opacity-70">({count})</span>}
                </button>
              );
            })}
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          )}

          {/* Error */}
          {isError && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
              <AlertTriangle className="w-4 h-4" />
              {sk ? 'Nepodarilo sa načítať novinky' : 'Failed to load news'}
            </div>
          )}

          {/* Empty state */}
          {filtered && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {sk ? 'Žiadne novinky pre tento filter' : 'No news for this filter'}
            </p>
          )}

          {/* News items */}
          {filtered?.map((item, idx) => {
            const hasUrl = !!item.url;
            const Wrapper = hasUrl ? 'a' : 'div';
            const wrapperProps = hasUrl
              ? { href: item.url, target: '_blank', rel: 'noopener noreferrer' }
              : {};

            const isHigh = item.impact === 'high';

            return (
              <Wrapper
                key={`${item.id}-${idx}`}
                {...wrapperProps}
                className={`block rounded-lg px-3 py-2.5 space-y-1.5 transition-colors ${
                  isHigh
                    ? 'bg-red-500/5 border border-red-500/20 hover:bg-red-500/10'
                    : 'bg-secondary/30 hover:bg-secondary/50'
                }`}
              >
                {/* Top row: impact + sentiment + tokens + time */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {impactBadge(item.impact, sk)}
                    {sentimentBadge(item.sentiment, sk)}
                  </div>
                  <span className="text-[9px] text-muted-foreground shrink-0">{timeAgo(item.publishedAt, sk)}</span>
                </div>

                {/* Title */}
                <div className="flex items-start gap-2">
                  <p className={`text-xs leading-relaxed flex-1 ${isHigh ? 'text-foreground font-medium' : 'text-foreground'}`}>
                    {item.title}
                  </p>
                  {hasUrl && <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />}
                </div>

                {/* Summary */}
                {item.summary && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {item.summary}
                  </p>
                )}

                {/* Bottom: tokens + source */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {item.tokens.slice(0, 3).map(t => (
                      <span
                        key={t}
                        className="text-[9px] px-1.5 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: (TOKEN_COLORS[t] ?? '#888') + '15',
                          color: TOKEN_COLORS[t] ?? '#888',
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <span className="text-[9px] text-muted-foreground">{item.source}</span>
                </div>
              </Wrapper>
            );
          })}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Newspaper, AlertTriangle, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';
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

function impactBadge(impact: NewsItem['impact'], sk: boolean) {
  const config = {
    high: { label: sk ? 'Vysoký dopad' : 'High Impact', className: 'bg-red-500/20 text-red-400' },
    medium: { label: sk ? 'Stredný' : 'Medium', className: 'bg-yellow-500/20 text-yellow-400' },
    low: { label: sk ? 'Nízky' : 'Low', className: 'bg-secondary text-muted-foreground' },
  };
  const c = config[impact];
  return <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${c.className}`}>{c.label}</span>;
}

function sentimentIcon(sentiment: NewsItem['sentiment']) {
  switch (sentiment) {
    case 'bullish': return <TrendingUp className="w-3 h-3 text-green-400" />;
    case 'bearish': return <TrendingDown className="w-3 h-3 text-red-400" />;
    default: return <Minus className="w-3 h-3 text-muted-foreground" />;
  }
}

function sentimentLabel(sentiment: NewsItem['sentiment'], sk: boolean) {
  const labels = {
    bullish: sk ? 'Bullish' : 'Bullish',
    bearish: sk ? 'Bearish' : 'Bearish',
    neutral: sk ? 'Neutrálne' : 'Neutral',
  };
  return labels[sentiment];
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
  const { data: news, isLoading, isError } = useCryptoNews();
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<string | null>(null);

  const filtered = filter ? news?.filter(n => n.tokens.includes(filter)) : news;

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
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3">
          {/* Token filters */}
          <div className="flex gap-1.5">
            <button
              onClick={() => setFilter(null)}
              className={`text-[10px] px-2 py-1 rounded-full transition-colors ${
                !filter ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
              }`}
            >
              {sk ? 'Všetky' : 'All'}
            </button>
            {['BTC', 'ETH', 'SOL', 'HYPE'].map(token => (
              <button
                key={token}
                onClick={() => setFilter(filter === token ? null : token)}
                className={`text-[10px] px-2 py-1 rounded-full transition-colors ${
                  filter === token ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground'
                }`}
              >
                {token}
              </button>
            ))}
          </div>

          {/* Loading */}
          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
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

          {/* News items */}
          {filtered && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {sk ? 'Žiadne novinky' : 'No news found'}
            </p>
          )}

          {filtered?.map(item => {
            const hasUrl = !!item.url;
            const Wrapper = hasUrl ? 'a' : 'div';
            const wrapperProps = hasUrl
              ? { href: item.url, target: '_blank', rel: 'noopener noreferrer' }
              : {};

            return (
              <Wrapper
                key={item.id}
                {...wrapperProps}
                className="block bg-secondary/30 rounded-lg px-3 py-2.5 space-y-1.5 hover:bg-secondary/50 transition-colors"
              >
                {/* Top row: impact + tokens + time */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    {impactBadge(item.impact, sk)}
                    {item.tokens.slice(0, 3).map(t => (
                      <span
                        key={t}
                        className="text-[9px] px-1 py-0.5 rounded font-medium"
                        style={{
                          backgroundColor: (TOKEN_COLORS[t] ?? '#888') + '20',
                          color: TOKEN_COLORS[t] ?? '#888',
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                  <span className="text-[9px] text-muted-foreground">{timeAgo(item.publishedAt, sk)}</span>
                </div>

                {/* Title */}
                <div className="flex items-start gap-2">
                  <p className="text-xs text-foreground leading-relaxed flex-1">{item.title}</p>
                  {hasUrl && <ExternalLink className="w-3 h-3 text-muted-foreground shrink-0 mt-0.5" />}
                </div>

                {/* Bottom: sentiment + source */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    {sentimentIcon(item.sentiment)}
                    <span className={`text-[9px] font-medium ${
                      item.sentiment === 'bullish' ? 'text-green-400' : item.sentiment === 'bearish' ? 'text-red-400' : 'text-muted-foreground'
                    }`}>
                      {sentimentLabel(item.sentiment, sk)}
                    </span>
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

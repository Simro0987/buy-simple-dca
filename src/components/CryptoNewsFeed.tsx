import { useState, useMemo } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronDown, Newspaper, AlertTriangle, TrendingUp, TrendingDown, Minus, ExternalLink, Zap, Activity, BarChart3, Siren } from 'lucide-react';
import { useCryptoNews, NewsItem } from '@/hooks/useCryptoNews';
import { Lang } from '@/lib/i18n';
import { Skeleton } from '@/components/ui/skeleton';
import { nativeTicker } from '@/lib/tickerLabels';
import { navigateToTab } from '@/lib/pendingActions';

interface Props {
  lang: Lang;
}

const PORTFOLIO_TOKENS = ['BTC', 'ETH', 'SOL'] as const;
type PortfolioToken = typeof PORTFOLIO_TOKENS[number];

const TOKEN_COLORS: Record<string, string> = {
  BTC: '#F7931A',
  ETH: '#627EEA',
  SOL: '#9945FF',
};

// Strict allowlist — only premium "Big Five" sources reach the feed
const PREMIUM_SOURCES = ['CoinDesk', 'CoinTelegraph', 'Decrypt', 'The Block', 'Blockworks'] as const;

// Flash-alert detection: high-volatility keywords
const FLASH_KEYWORDS = /\b(exploit|hack|fork|sec|regulator|regulatory|halving|etf|breach|stolen|delist|ban|approval|approved|rejected|crash|collapse)\b/i;

function isFlash(item: NewsItem): boolean {
  return item.impact === 'high' && FLASH_KEYWORDS.test(`${item.title} ${item.summary ?? ''}`);
}

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

// Pick a single primary actionable token (first portfolio match)
function primaryToken(item: NewsItem): PortfolioToken | null {
  for (const t of item.tokens) {
    const native = nativeTicker(t).toUpperCase() as PortfolioToken;
    if (PORTFOLIO_TOKENS.includes(native)) return native;
  }
  return null;
}

export function CryptoNewsFeed({ lang }: Props) {
  const sk = lang === 'sk';
  const { data: news, isLoading, isError } = useCryptoNews('BTC,ETH,SOL', lang);
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<PortfolioToken | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);

  // STRICT PORTFOLIO FILTER + premium-source allowlist (defensive)
  const cleaned = useMemo<NewsItem[]>(() => {
    if (!news) return [];
    return news
      .map(n => ({
        ...n,
        tokens: n.tokens
          .map(t => nativeTicker(t).toUpperCase())
          .filter((t, i, arr) => arr.indexOf(t) === i && (PORTFOLIO_TOKENS as readonly string[]).includes(t)),
      }))
      .filter(n => n.tokens.length > 0);
  }, [news]);

  const filtered = useMemo(() => {
    let list = cleaned;
    if (filter) list = list.filter(n => n.tokens.includes(filter));
    if (sourceFilter) list = list.filter(n => n.source === sourceFilter);
    // Pin flash alerts to absolute top
    return [...list].sort((a, b) => {
      const af = isFlash(a) ? 0 : 1;
      const bf = isFlash(b) ? 0 : 1;
      if (af !== bf) return af - bf;
      return 0; // keep upstream order otherwise
    });
  }, [cleaned, filter, sourceFilter]);

  const tokenCounts = useMemo(() => {
    const counts: Record<PortfolioToken, number> = { BTC: 0, ETH: 0, SOL: 0 };
    for (const n of cleaned) for (const t of n.tokens) {
      if ((PORTFOLIO_TOKENS as readonly string[]).includes(t)) counts[t as PortfolioToken]++;
    }
    return counts;
  }, [cleaned]);

  const flashCount = cleaned.filter(isFlash).length;

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <div className="glass-card p-4 space-y-3">
        <CollapsibleTrigger className="flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            <Newspaper className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold text-foreground">
              {sk ? 'Novinky z portfólia' : 'Portfolio News'}
            </span>
            {sk && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/15 text-primary border border-primary/30 font-medium"
                title="Automaticky preložené do slovenčiny"
              >
                🇸🇰 Auto SK
              </span>
            )}
            {flashCount > 0 && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-red-500/30 text-red-300 font-bold inline-flex items-center gap-1 animate-pulse">
                <Siren className="w-2.5 h-2.5" /> {flashCount} FLASH
              </span>
            )}
          </div>
          <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </CollapsibleTrigger>

        <CollapsibleContent className="space-y-3">
          {/* Token filters: portfolio only */}
          <div className="flex gap-1.5 flex-wrap">
            <button
              onClick={() => setFilter(null)}
              className={`text-[10px] px-2.5 py-1 rounded-full transition-colors font-medium ${
                !filter ? 'bg-primary text-primary-foreground' : 'bg-secondary text-secondary-foreground hover:bg-secondary/80'
              }`}
            >
              {sk ? 'Všetko' : 'All'} ({cleaned.length})
            </button>
            {PORTFOLIO_TOKENS.map(token => {
              const count = tokenCounts[token];
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

          {/* Big-Five source filters */}
          <div className="flex gap-1.5 flex-wrap">
            {PREMIUM_SOURCES.map(source => {
              const count = cleaned.filter(n => n.source === source).length;
              if (count === 0) return null;
              const isActive = sourceFilter === source;
              return (
                <button
                  key={source}
                  onClick={() => setSourceFilter(isActive ? null : source)}
                  className={`text-[9px] px-2 py-0.5 rounded-full transition-colors font-medium ${
                    isActive
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-secondary/60 text-muted-foreground hover:bg-secondary'
                  }`}
                >
                  {source} ({count})
                </button>
              );
            })}
          </div>

          {isLoading && (
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <Skeleton key={i} className="h-20 w-full rounded-lg" />
              ))}
            </div>
          )}

          {isError && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-4 justify-center">
              <AlertTriangle className="w-4 h-4" />
              {sk ? 'Nepodarilo sa načítať novinky' : 'Failed to load news'}
            </div>
          )}

          {!isLoading && filtered.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              {sk ? 'Žiadne novinky pre tento filter' : 'No news for this filter'}
            </p>
          )}

          {filtered.map((item, idx) => {
            const hasUrl = !!item.url;
            const flash = isFlash(item);
            const isHigh = item.impact === 'high';
            const primary = primaryToken(item);

            return (
              <div
                key={`${item.id}-${idx}`}
                className={`block rounded-lg px-3 py-2.5 space-y-1.5 transition-colors ${
                  flash
                    ? 'bg-red-500/10 border border-red-500/40 ring-1 ring-red-500/30'
                    : isHigh
                      ? 'bg-red-500/5 border border-red-500/20'
                      : 'bg-secondary/30'
                }`}
              >
                {flash && (
                  <div className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-500 text-white animate-pulse">
                    <Siren className="w-2.5 h-2.5" /> 🚨 Flash Alert
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {impactBadge(item.impact, sk)}
                    {sentimentBadge(item.sentiment, sk)}
                  </div>
                  <span className="text-[9px] text-muted-foreground shrink-0">{timeAgo(item.publishedAt, sk)}</span>
                </div>

                <div className="flex items-start gap-2">
                  <p className={`text-xs leading-relaxed flex-1 ${isHigh ? 'text-foreground font-medium' : 'text-foreground'}`}>
                    {item.title}
                  </p>
                  {hasUrl && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground shrink-0 mt-0.5">
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>

                {item.summary && (
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    {item.summary}
                  </p>
                )}

                <div className="flex items-center justify-between gap-2 flex-wrap">
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

                  {/* Actionable micro-links */}
                  {primary && (
                    <div className="flex items-center gap-1">
                      {item.sentiment !== 'bearish' && (
                        <button
                          onClick={() => navigateToTab('dca')}
                          className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/25 active:scale-95 transition"
                          aria-label={`DCA ${primary}`}
                        >
                          [DCA {primary}]
                        </button>
                      )}
                      {(primary === 'ETH' || primary === 'SOL') && (
                        <button
                          onClick={() => navigateToTab('staking')}
                          className="text-[9px] px-1.5 py-0.5 rounded font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30 hover:bg-violet-500/25 active:scale-95 transition"
                          aria-label={`Stake ${primary}`}
                        >
                          [Go Stake]
                        </button>
                      )}
                    </div>
                  )}

                  <span className="text-[9px] text-muted-foreground">{item.source}</span>
                </div>
              </div>
            );
          })}
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

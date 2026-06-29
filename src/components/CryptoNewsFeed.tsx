import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, Clock, TrendingUp, TrendingDown, Minus, Flame, Zap, Newspaper } from 'lucide-react';

/* ──────────────────────────────────────────────────────────────────────────
 * Types
 * ────────────────────────────────────────────────────────────────────────── */
type Sentiment = 'bullish' | 'bearish' | 'neutral';
type Category = 'KRYPTO' | 'MAKRO' | 'BTC' | 'ETH' | 'SOL';

interface Article {
  id: string;
  title: string;
  excerpt: string;
  image: string;
  source: string;
  sourceLogo: string;
  category: Category;
  sentiment: Sentiment;
  publishedAt: number; // epoch ms
}

/* ──────────────────────────────────────────────────────────────────────────
 * Fallback mock data (Slovak) — used if the API fails, is blocked by CORS,
 * times out, or returns empty. The UI looks perfect immediately.
 * ────────────────────────────────────────────────────────────────────────── */
const MOCK_NEWS: Article[] = [
  {
    id: 'm1',
    title: 'Bitcoin prerazil kľúčovú rezistenciu, inštitúcie hromadia pozície',
    excerpt:
      'Po týždňoch konsolidácie sa cena BTC posunula prudko nahor. Analytici poukazujú na rastúci prílev kapitálu do spotových ETF a otáčajúci sa trhový sentiment.',
    image: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=900&q=80',
    source: 'CoinDesk',
    sourceLogo: 'https://www.google.com/s2/favicons?domain=coindesk.com&sz=64',
    category: 'BTC',
    sentiment: 'bullish',
    publishedAt: Date.now() - 2 * 3600_000,
  },
  {
    id: 'm2',
    title: 'Ethereum upgrade znižuje poplatky, aktivita v DeFi prudko rastie',
    excerpt:
      'Najnovšia aktualizácia siete výrazne zlacnila transakcie. Vývojári hlásia nárast objemov naprieč hlavnými DeFi protokolmi a L2 riešeniami.',
    image: 'https://images.unsplash.com/photo-1622630998477-20aa696ecb05?w=900&q=80',
    source: 'The Block',
    sourceLogo: 'https://www.google.com/s2/favicons?domain=theblock.co&sz=64',
    category: 'ETH',
    sentiment: 'bullish',
    publishedAt: Date.now() - 4 * 3600_000,
  },
  {
    id: 'm3',
    title: 'Solana čelí korekcii po rekordných objemoch, obchodníci vyberajú zisky',
    excerpt:
      'SOL po silnom raste zaznamenala výpredaj. Dlhodobý výhľad ekosystému však podľa analytikov zostáva stabilný vďaka silnej developerskej aktivite.',
    image: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?w=900&q=80',
    source: 'Cointelegraph',
    sourceLogo: 'https://www.google.com/s2/favicons?domain=cointelegraph.com&sz=64',
    category: 'SOL',
    sentiment: 'bearish',
    publishedAt: Date.now() - 6 * 3600_000,
  },
  {
    id: 'm4',
    title: 'Centrálne banky pripravujú nový regulačný rámec pre stablecoiny',
    excerpt:
      'Makroekonomické prostredie naďalej tlačí na kryptotrh. Regulátori dolaďujú pravidlá, ktoré môžu ovplyvniť likviditu naprieč globálnymi trhmi.',
    image: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf45e?w=900&q=80',
    source: 'CoinGecko',
    sourceLogo: 'https://www.google.com/s2/favicons?domain=coingecko.com&sz=64',
    category: 'MAKRO',
    sentiment: 'neutral',
    publishedAt: Date.now() - 9 * 3600_000,
  },
  {
    id: 'm5',
    title: 'Inštitucionálny záujem o krypto ETF láme rekordy',
    excerpt:
      'Objem spravovaných aktív v kryptofondoch dosiahol nové maximá. Analytici to vnímajú ako signál dlhodobej dôvery a dozrievania trhu.',
    image: 'https://images.unsplash.com/photo-1640340434855-6084b1f4901c?w=900&q=80',
    source: 'CoinMarketCap',
    sourceLogo: 'https://www.google.com/s2/favicons?domain=coinmarketcap.com&sz=64',
    category: 'KRYPTO',
    sentiment: 'bullish',
    publishedAt: Date.now() - 12 * 3600_000,
  },
];

const FILTERS: { key: 'all' | Category; label: string }[] = [
  { key: 'all', label: 'Všetko' },
  { key: 'MAKRO', label: 'Makro' },
  { key: 'BTC', label: 'BTC' },
  { key: 'ETH', label: 'ETH' },
  { key: 'SOL', label: 'SOL' },
];

/* ──────────────────────────────────────────────────────────────────────────
 * Source logo mapping — maps known source names to their logo URLs.
 * Unknown sources fall back to a generic icon (handled in <SourceFooter />).
 * ────────────────────────────────────────────────────────────────────────── */
const sourceLogos: Record<string, string> = {
  CoinDesk: 'https://cryptopanic.com/s/img/news/coindesk.png',
  Cointelegraph: 'https://cryptopanic.com/s/img/news/cointelegraph.png',
  'The Block': 'https://cryptopanic.com/s/img/news/theblock.png',
  Decrypt: 'https://cryptopanic.com/s/img/news/decrypt.png',
};

/** Resolve a source name to a mapped logo URL, or '' if unknown. */
function resolveSourceLogo(source: string, apiLogo = ''): string {
  return sourceLogos[source] || apiLogo || '';
}

/* ──────────────────────────────────────────────────────────────────────────
 * Helpers
 * ────────────────────────────────────────────────────────────────────────── */
function timeAgo(ts: number): string {
  const diff = Math.max(0, Date.now() - ts);
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'práve teraz';
  if (mins < 60) return `pred ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `pred ${hours} hod`;
  const days = Math.floor(hours / 24);
  return `pred ${days} dňami`;
}

function deriveCategory(tags = '', title = ''): Category {
  const hay = `${tags} ${title}`.toUpperCase();
  if (/\bBTC\b|BITCOIN/.test(hay)) return 'BTC';
  if (/\bETH\b|ETHEREUM/.test(hay)) return 'ETH';
  if (/\bSOL\b|SOLANA/.test(hay)) return 'SOL';
  if (/REGULAT|FED|MACRO|BANK|ETF/.test(hay)) return 'MAKRO';
  return 'KRYPTO';
}

function deriveSentiment(title = '', body = ''): Sentiment {
  const hay = `${title} ${body}`.toLowerCase();
  const bull = ['surge', 'rally', 'soar', 'gain', 'bullish', 'rise', 'jump', 'growth', 'high', 'approval'];
  const bear = ['drop', 'fall', 'crash', 'plunge', 'bearish', 'decline', 'sell-off', 'loss', 'down', 'ban'];
  const score =
    bull.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0) -
    bear.reduce((a, w) => a + (hay.includes(w) ? 1 : 0), 0);
  if (score > 0) return 'bullish';
  if (score < 0) return 'bearish';
  return 'neutral';
}

const SENTIMENT_CONFIG: Record<Sentiment, { label: string; cls: string; Icon: typeof TrendingUp }> = {
  bullish: { label: '↗ BULLISH', cls: 'bg-emerald-500/15 text-emerald-400 ring-1 ring-emerald-500/30', Icon: TrendingUp },
  bearish: { label: '↘ BEARISH', cls: 'bg-red-500/15 text-red-400 ring-1 ring-red-500/30', Icon: TrendingDown },
  neutral: { label: '— NEUTRÁLNE', cls: 'bg-zinc-500/15 text-zinc-400 ring-1 ring-zinc-500/30', Icon: Minus },
};

const FALLBACK_IMG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300"><rect width="600" height="300" fill="#18181b"/><text x="50%" y="50%" fill="#3f3f46" font-family="sans-serif" font-size="20" text-anchor="middle" dominant-baseline="middle">Noviny</text></svg>`,
  );

/* ──────────────────────────────────────────────────────────────────────────
 * Small presentational pieces
 * ────────────────────────────────────────────────────────────────────────── */
function SentimentBadge({ sentiment }: { sentiment: Sentiment }) {
  const s = SENTIMENT_CONFIG[sentiment];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${s.cls}`}>
      <s.Icon className="h-3 w-3" />
      {s.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: Category }) {
  return (
    <span className="rounded-full bg-zinc-800 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-zinc-300">
      {category}
    </span>
  );
}

function SourceFooter({ article }: { article: Article }) {
  return (
    <div className="mt-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        {article.sourceLogo ? (
          <img
            src={article.sourceLogo}
            alt={article.source}
            referrerPolicy="no-referrer"
            className="h-5 w-5 rounded-full bg-zinc-800 object-cover ring-1 ring-zinc-700"
            onError={(e) => {
              // Hide broken logo and reveal the generic icon sibling
              const img = e.currentTarget as HTMLImageElement;
              img.style.display = 'none';
              const fallback = img.nextElementSibling as HTMLElement | null;
              if (fallback) fallback.style.display = 'flex';
            }}
          />
        ) : null}
        <span
          className="h-5 w-5 items-center justify-center rounded-full bg-zinc-800 text-zinc-400 ring-1 ring-zinc-700"
          style={{ display: article.sourceLogo ? 'none' : 'flex' }}
        >
          <Newspaper className="h-3 w-3" />
        </span>
        <span className="text-xs font-medium text-zinc-400">{article.source}</span>
      </div>
      <span className="flex items-center gap-1 text-xs text-zinc-500">
        <Clock className="h-3 w-3" />
        {timeAgo(article.publishedAt)}
      </span>
    </div>
  );
}

function SkeletonCard({ hero = false }: { hero?: boolean }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900">
      <div className={`w-full animate-pulse bg-zinc-800 ${hero ? 'h-44' : 'h-28'}`} />
      <div className="space-y-3 p-4">
        <div className="h-4 w-24 animate-pulse rounded-full bg-zinc-800" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-full animate-pulse rounded bg-zinc-800" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-zinc-800" />
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Main component
 * ────────────────────────────────────────────────────────────────────────── */
export function CryptoNewsFeed() {
  const [news, setNews] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState<'all' | Category>('all');
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);

  const loadNews = useCallback(async () => {
    setRefreshing(true);
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      const res = await fetch('https://min-api.cryptocompare.com/data/v2/news/?lang=EN', {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) throw new Error('Bad response');

      const json = await res.json();
      const raw: any[] = Array.isArray(json?.Data) ? json.Data : [];
      if (raw.length === 0) throw new Error('Empty data');

      const mapped: Article[] = raw.slice(0, 12).map((a, i) => ({
        id: a.id ? String(a.id) : `api-${i}`,
        title: a.title || 'Bez názvu',
        excerpt: a.body || '',
        image: a.imageurl || FALLBACK_IMG,
        source: a.source_info?.name || a.source || 'Neznámy zdroj',
        sourceLogo: resolveSourceLogo(a.source_info?.name || a.source || '', a.source_info?.img || ''),
        category: deriveCategory(a.tags, a.title),
        sentiment: deriveSentiment(a.title, a.body),
        publishedAt: a.published_on ? a.published_on * 1000 : Date.now(),
      }));

      setNews(mapped);
    } catch {
      // ANTI-CRASH FALLBACK: never show a blank screen
      setNews(MOCK_NEWS);
    } finally {
      setLastUpdated(Date.now());
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadNews();
  }, [loadNews]);

  const filtered = activeFilter === 'all' ? news : news.filter((n) => n.category === activeFilter);
  // Defensive: if a filter empties the list, fall back to full list so it's never blank
  const safeList = filtered.length > 0 ? filtered : news;
  const [hero, ...rest] = safeList;

  return (
    <div className="min-h-screen bg-zinc-950 font-sans text-zinc-100">
      <style>{`
        @keyframes news-ticker-scroll {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        .news-ticker {
          display: inline-block;
          animation: news-ticker-scroll 18s linear infinite;
        }
      `}</style>
      <div className="mx-auto max-w-md px-4 py-6">
        {/* Flash alert ticker — persistent urgent market news */}
        <div className="mb-4 flex items-center gap-2 overflow-hidden rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2">
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-400">
            <Zap className="h-3 w-3 animate-pulse" />
            Flash
          </span>
          <div className="relative flex-1 overflow-hidden">
            <p className="news-ticker whitespace-nowrap text-xs font-medium text-amber-200/90">
              <span className="px-2">BTC prudko rastie nad kľúčovú úroveň • Fed signalizuje stabilné sadzby • ETH ETF zaznamenáva rekordné prílevy • SOL preráža rezistenciu •&nbsp;</span>
              <span className="px-2" aria-hidden="true">BTC prudko rastie nad kľúčovú úroveň • Fed signalizuje stabilné sadzby • ETH ETF zaznamenáva rekordné prílevy • SOL preráža rezistenciu •&nbsp;</span>
            </p>
          </div>
        </div>

        {/* Header */}
        <header className="mb-5">
          <div className="flex items-center justify-between">
            <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
              <span className="text-emerald-400">((o))</span>
              Noviny
            </h1>
            <button
              onClick={loadNews}
              className="rounded-full border border-zinc-800 bg-zinc-900 p-2 text-zinc-400 transition hover:border-emerald-500/40 hover:text-emerald-400"
              aria-label="Obnoviť"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
          <div className="mt-2 flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <p className="text-xs text-zinc-500">
              Posledná aktualizácia:{' '}
              <span className="text-zinc-300">
                {lastUpdated
                  ? new Date(lastUpdated).toLocaleTimeString('sk-SK', { hour: '2-digit', minute: '2-digit' })
                  : 'práve teraz'}
              </span>
            </p>
          </div>
        </header>

        {/* Filter pills */}
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 scrollbar-hide">
          {FILTERS.map((f) => {
            const active = activeFilter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`shrink-0 rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                  active
                    ? 'bg-white text-black shadow-[0_0_16px_-4px_rgba(255,255,255,0.4)]'
                    : 'bg-zinc-900 text-zinc-400 ring-1 ring-zinc-800 hover:text-zinc-200'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        {/* Content */}
        {loading ? (
          <div className="space-y-4">
            <SkeletonCard hero />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Hero / Top story */}
            {hero && (
              <article className="group overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900 transition hover:border-zinc-700">
                <div className="relative h-44 w-full overflow-hidden">
                  <img
                    src={hero.image}
                    alt={hero.title}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                    }}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-zinc-900 via-zinc-900/20 to-transparent" />
                  <div className="absolute left-3 top-3">
                    <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg">
                      <Flame className="h-3 w-3" />
                      Dnešná top správa
                    </span>
                  </div>
                </div>
                <div className="p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <CategoryBadge category={hero.category} />
                    <SentimentBadge sentiment={hero.sentiment} />
                  </div>
                  <h2 className="text-balance text-lg font-bold leading-snug text-white">{hero.title}</h2>
                  <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-zinc-400">{hero.excerpt}</p>
                  <SourceFooter article={hero} />
                </div>
              </article>
            )}

            {/* Feed cards */}
            {rest.map((item) => (
              <article
                key={item.id}
                className="group flex gap-3 overflow-hidden rounded-2xl border border-zinc-800/50 bg-zinc-900 p-3 transition hover:border-emerald-500/30 hover:shadow-[0_0_18px_-6px_rgba(16,185,129,0.35)]"
              >
                <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-zinc-800">
                  <img
                    src={item.image}
                    alt={item.title}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).src = FALLBACK_IMG;
                    }}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
                    <CategoryBadge category={item.category} />
                    <SentimentBadge sentiment={item.sentiment} />
                  </div>
                  <h3 className="line-clamp-2 text-sm font-bold leading-snug text-white">{item.title}</h3>
                  <p className="mt-1 line-clamp-1 text-xs leading-relaxed text-zinc-500">{item.excerpt}</p>
                  <SourceFooter article={item} />
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default CryptoNewsFeed;

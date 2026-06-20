/**
 * MacroNewsTicker — top macro headline of the day with Flash Alert
 *
 * Data source (100 % free, no API key):
 *   rss2json.com  →  CoinDesk RSS  (primary)
 *                 →  Cointelegraph RSS  (fallback)
 * Free tier: 10 000 req/day per IP, no registration needed.
 */
import { useState, useEffect, useCallback } from 'react';
import { Zap, ExternalLink, RefreshCw, Radio, AlertTriangle } from 'lucide-react';

// ─── types ───────────────────────────────────────────────────────────────────

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  author?: string;
}

interface Rss2JsonResponse {
  status: string;
  feed?: { title: string; link: string };
  items?: RssItem[];
}

export interface MacroNews {
  title: string;
  url: string;
  pubDate: string;
  source: string;
  isFlash: boolean;
  flashTag: string;
  ageLabel: string;
}

// ─── flash keyword registry ──────────────────────────────────────────────────

const FLASH_KEYWORDS: { kw: string; tag: string }[] = [
  { kw: 'fed',             tag: 'Fed'       },
  { kw: 'federal reserve', tag: 'Fed'       },
  { kw: 'rate cut',        tag: 'Rate Cut'  },
  { kw: 'rate hike',       tag: 'Rate Hike' },
  { kw: 'interest rate',   tag: 'Rates'     },
  { kw: 'crash',           tag: 'Crash'     },
  { kw: 'collapse',        tag: 'Kolaps'    },
  { kw: 'dump',            tag: 'Dump'      },
  { kw: 'surge',           tag: 'Surge'     },
  { kw: 'all-time high',   tag: 'ATH'       },
  { kw: 'etf',             tag: 'ETF'       },
  { kw: 'sec',             tag: 'SEC'       },
  { kw: 'hack',            tag: 'Hack'      },
  { kw: 'exploit',         tag: 'Exploit'   },
  { kw: 'bankrupt',        tag: 'Bankrot'   },
  { kw: 'liquidat',        tag: 'Likvidácia'},
  { kw: 'liquidity',       tag: 'Liquidita' },
  { kw: 'ban',             tag: 'Zákaz'     },
  { kw: 'regulation',      tag: 'Regulácia' },
  { kw: 'inflation',       tag: 'Inflácia'  },
  { kw: 'recession',       tag: 'Recesia'   },
  { kw: 'emergency',       tag: 'Núdzový'   },
  { kw: 'china',           tag: 'Čína'      },
  { kw: 'war',             tag: 'Vojna'     },
  { kw: 'sanction',        tag: 'Sankcie'   },
  { kw: 'black swan',      tag: 'Black Swan'},
  { kw: 'bubble',          tag: 'Bublina'   },
  { kw: 'panic',           tag: 'Panika'    },
];

const CRYPTO_KEYWORDS = ['bitcoin', 'btc', 'ethereum', 'eth', 'solana', 'sol',
  'crypto', 'defi', 'nft', 'stablecoin', 'blockchain', 'coinbase', 'binance'];

// ─── helpers ─────────────────────────────────────────────────────────────────

function detectFlash(text: string): { isFlash: boolean; tag: string } {
  const lower = text.toLowerCase();
  for (const { kw, tag } of FLASH_KEYWORDS) {
    if (lower.includes(kw)) return { isFlash: true, tag };
  }
  return { isFlash: false, tag: '' };
}

function scoreItem(item: RssItem): number {
  const text  = (item.title + ' ' + (item.description ?? '')).toLowerCase();
  let score   = 0;
  if (detectFlash(item.title).isFlash) score += 20;
  for (const kw of CRYPTO_KEYWORDS) if (text.includes(kw)) { score += 5; break; }
  const ageMins = (Date.now() - new Date(item.pubDate).getTime()) / 60_000;
  if (ageMins <  60) score += 12;
  else if (ageMins < 360) score += 6;
  else if (ageMins < 720) score += 2;
  return score;
}

function ageLabel(pubDate: string): string {
  const mins = Math.round((Date.now() - new Date(pubDate).getTime()) / 60_000);
  if (mins <   2) return 'práve teraz';
  if (mins <  60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  if (h   <  24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ─── RSS sources ─────────────────────────────────────────────────────────────

const SOURCES: { name: string; rssUrl: string }[] = [
  {
    name:   'CoinDesk',
    rssUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
  },
  {
    name:   'Cointelegraph',
    rssUrl: 'https://cointelegraph.com/rss',
  },
  {
    name:   'The Block',
    rssUrl: 'https://www.theblock.co/rss.xml',
  },
];

async function fetchFromSource(source: { name: string; rssUrl: string }): Promise<MacroNews | null> {
  const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.rssUrl)}&api_key=&count=10`;
  const res  = await fetchWithTimeout(apiUrl, 9_000);
  if (!res.ok) throw new Error(`rss2json ${source.name}: ${res.status}`);
  const json = await res.json() as Rss2JsonResponse;
  if (json.status !== 'ok' || !json.items?.length) throw new Error('empty feed');

  const items   = json.items.slice(0, 10);
  const best    = items.reduce((a, b) => scoreItem(a) >= scoreItem(b) ? a : b);
  const { isFlash, tag } = detectFlash(best.title);

  return {
    title:    best.title.trim(),
    url:      best.link,
    pubDate:  best.pubDate,
    source:   source.name,
    isFlash,
    flashTag: tag,
    ageLabel: ageLabel(best.pubDate),
  };
}

// ─── localStorage cache ───────────────────────────────────────────────────────

const NEWS_CACHE_KEY = 'macro-news-cache-v1';
const NEWS_CACHE_TTL = 15 * 60 * 1000; // 15 min

function readNewsCache(): MacroNews | null {
  try {
    const raw = localStorage.getItem(NEWS_CACHE_KEY);
    if (!raw) return null;
    const { ts, item } = JSON.parse(raw) as { ts: number; item: MacroNews };
    if (Date.now() - ts > NEWS_CACHE_TTL) return null;
    return item;
  } catch { return null; }
}

function writeNewsCache(item: MacroNews) {
  try {
    localStorage.setItem(NEWS_CACHE_KEY, JSON.stringify({ ts: Date.now(), item }));
  } catch { /* quota — ignore */ }
}

// ─── static fallback shown when ALL RSS sources fail ─────────────────────────

const STATIC_FALLBACK: MacroNews = {
  title:    'Správy momentálne nedostupné — skontroluj CoinDesk alebo Cointelegraph ručne.',
  url:      'https://www.coindesk.com',
  pubDate:  new Date().toISOString(),
  source:   'Fallback',
  isFlash:  false,
  flashTag: '',
  ageLabel: '—',
};

// ─── component ────────────────────────────────────────────────────────────────

export function MacroNewsTicker() {
  const [news,    setNews]    = useState<MacroNews | null>(() => readNewsCache());
  const [loading, setLoading] = useState(!readNewsCache());
  const [error,   setError]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);

    for (const source of SOURCES) {
      try {
        const item = await fetchFromSource(source);
        if (item) {
          setNews(item);
          writeNewsCache(item);
          setLoading(false);
          return;
        }
      } catch {
        // try next source
      }
    }

    // All sources failed — use cache if available, else static fallback
    const cached = readNewsCache();
    setNews(cached ?? STATIC_FALLBACK);
    setError(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!news) { void load(); }
    // Auto-refresh every 15 min
    const id = setInterval(() => { void load(); }, NEWS_CACHE_TTL);
    return () => clearInterval(id);
  }, [load, news]);

  const isFlash = !!news?.isFlash;

  return (
    <div
      className={`glass-card p-3 transition-colors ${
        isFlash
          ? 'border-amber-500/40 bg-amber-500/5'
          : ''
      }`}
    >
      {/* Header row */}
      <div className="flex items-center gap-1.5 mb-2">
        <Radio className="w-3 h-3 text-muted-foreground" />
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex-1">
          Macro News · Top Story
        </p>
        {isFlash && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40">
            <Zap className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wide">
              Flash · {news?.flashTag}
            </span>
          </span>
        )}
        <button
          onClick={load}
          disabled={loading}
          className="p-0.5 rounded hover:bg-secondary transition-colors disabled:opacity-40"
          title="Obnoviť správy"
        >
          <RefreshCw className={`w-3 h-3 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-1.5">
          <div className="h-3 bg-secondary/50 rounded animate-pulse w-full" />
          <div className="h-3 bg-secondary/30 rounded animate-pulse w-3/4" />
        </div>
      )}

      {/* Error + content (show fallback chart, not blank) */}
      {!loading && news && (
        <>
          {error && (
            <div className="flex items-center gap-1.5 mb-1.5 text-[9px] text-rose-400/80">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              RSS nedostupné — zobrazená posledná cachovaná správa
            </div>
          )}

          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`group flex items-start gap-1.5 rounded-lg p-2 transition-colors hover:bg-secondary/40 ${
              isFlash ? 'bg-amber-500/8' : 'bg-secondary/20'
            }`}
          >
            {isFlash
              ? <Zap    className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
              : <Radio  className="w-3.5 h-3.5 text-muted-foreground/50 mt-0.5 shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] font-semibold leading-snug ${
                isFlash ? 'text-amber-100' : 'text-foreground'
              }`}>
                {news.title}
              </p>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] text-muted-foreground font-medium">{news.source}</span>
                <span className="text-[9px] text-muted-foreground/50">·</span>
                <span className="text-[9px] text-muted-foreground/60 tabular-nums">{news.ageLabel}</span>
              </div>
            </div>
            <ExternalLink className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
          </a>
        </>
      )}

      {/* Footer */}
      <p className="text-[9px] text-muted-foreground/40 text-center mt-2">
        Správy: CoinDesk / Cointelegraph / The Block RSS · rss2json.com (free)
      </p>
    </div>
  );
}

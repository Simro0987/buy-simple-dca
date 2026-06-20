/**
 * MacroNewsTicker — token-specific top headline in Slovak with Flash Alert
 *
 * Data sources (100 % free, no API key required):
 *   rss2json.com   → CoinDesk / Cointelegraph / The Block RSS  (free, 10k req/day)
 *   MyMemory API   → English → Slovak translation              (free, 5 000 chars/day)
 *
 * Headline is filtered for the active token (BTC / ETH / SOL).
 * If no token-specific article exists, best macro article is shown instead.
 * Flash Alert triggers on macro-critical keywords in the Slovak translation.
 */
import { useState, useEffect, useCallback } from 'react';
import { Zap, ExternalLink, RefreshCw, Radio, AlertTriangle } from 'lucide-react';
import type { OctToken } from '@/hooks/useConfluenceMetrics';

// ─── types ────────────────────────────────────────────────────────────────────

export interface MacroNews {
  titleSk: string;     // Slovak translation
  titleEn: string;     // Original English (used as fallback)
  url: string;
  pubDate: string;
  source: string;
  isFlash: boolean;
  flashTag: string;
  ageLabel: string;
  tokenMatch: boolean; // whether article is specific to activeToken
}

interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description?: string;
}

interface Rss2JsonResponse {
  status: string;
  items?: RssItem[];
}

// ─── token keyword maps ───────────────────────────────────────────────────────

const TOKEN_KEYWORDS: Record<OctToken, string[]> = {
  BTC: ['bitcoin', 'btc', 'satoshi', 'lightning', 'halving', 'miner', 'hash rate'],
  ETH: ['ethereum', 'eth', 'ether', 'vitalik', 'defi', 'erc-20', 'staking', 'layer 2', 'l2'],
  SOL: ['solana', 'sol', 'phantom', 'jito', 'raydium', 'pump.fun', 'meme coin'],
};

// ─── flash keywords (Slovak + English fallback) ───────────────────────────────

const FLASH_KEYWORDS: { kw: string; tag: string }[] = [
  // Monetary policy
  { kw: 'fed',         tag: 'Fed'       },
  { kw: 'federal',     tag: 'Fed'       },
  { kw: 'sadzb',       tag: 'Sadzby'    }, // sadzba/sadzby/sadzbách
  { kw: 'rate cut',    tag: 'Rate Cut'  },
  { kw: 'rate hike',   tag: 'Rate Hike' },
  { kw: 'úrokov',      tag: 'Úroky'     },
  // Market moves
  { kw: 'crash',       tag: 'Crash'     },
  { kw: 'krach',       tag: 'Krach'     },
  { kw: 'kolaps',      tag: 'Kolaps'    },
  { kw: 'pokles',      tag: 'Pokles'    },
  { kw: 'dump',        tag: 'Dump'      },
  { kw: 'surge',       tag: 'Surge'     },
  { kw: 'nárast',      tag: 'Nárast'    },
  { kw: 'all-time',    tag: 'ATH'       },
  { kw: 'rekord',      tag: 'Rekord'    },
  // Instruments / regulation
  { kw: 'etf',         tag: 'ETF'       },
  { kw: 'sec',         tag: 'SEC'       },
  { kw: 'regulác',     tag: 'Regulácia' },
  { kw: 'zákaz',       tag: 'Zákaz'     },
  { kw: 'sankcí',      tag: 'Sankcie'   },
  { kw: 'sanction',    tag: 'Sankcie'   },
  { kw: 'ban',         tag: 'Zákaz'     },
  // Liquidity / risk
  { kw: 'likvid',      tag: 'Likvidita' }, // likvidita / likvidácia
  { kw: 'liquidat',    tag: 'Likvidácia'},
  { kw: 'hack',        tag: 'Hack'      },
  { kw: 'exploit',     tag: 'Exploit'   },
  { kw: 'bankrot',     tag: 'Bankrot'   },
  { kw: 'bankrupt',    tag: 'Bankrot'   },
  // Macro
  { kw: 'inflác',      tag: 'Inflácia'  },
  { kw: 'inflation',   tag: 'Inflácia'  },
  { kw: 'recesia',     tag: 'Recesia'   },
  { kw: 'recession',   tag: 'Recesia'   },
  { kw: 'núdzov',      tag: 'Núdzový'   },
  { kw: 'emergency',   tag: 'Núdzový'   },
  { kw: 'čína',        tag: 'Čína'      },
  { kw: 'china',       tag: 'Čína'      },
  { kw: 'vojna',       tag: 'Vojna'     },
  { kw: 'war',         tag: 'Vojna'     },
  { kw: 'panik',       tag: 'Panika'    },
  { kw: 'panic',       tag: 'Panika'    },
  { kw: 'bublin',      tag: 'Bublina'   },
  { kw: 'bubble',      tag: 'Bublina'   },
  { kw: 'black swan',  tag: 'Black Swan'},
];

function detectFlash(text: string): { isFlash: boolean; tag: string } {
  const lower = text.toLowerCase();
  for (const { kw, tag } of FLASH_KEYWORDS) {
    if (lower.includes(kw)) return { isFlash: true, tag };
  }
  return { isFlash: false, tag: '' };
}

// ─── RSS sources ──────────────────────────────────────────────────────────────

const RSS_SOURCES = [
  { name: 'CoinDesk',      url: 'https://www.coindesk.com/arc/outboundfeeds/rss/'  },
  { name: 'Cointelegraph', url: 'https://cointelegraph.com/rss'                    },
  { name: 'The Block',     url: 'https://www.theblock.co/rss.xml'                  },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function ageLabel(pubDate: string): string {
  const mins = Math.round((Date.now() - new Date(pubDate).getTime()) / 60_000);
  if (mins <   2) return 'práve teraz';
  if (mins <  60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h   <  24) return `${h} h`;
  return `${Math.floor(h / 24)} d`;
}

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try   { return await fetch(url, { signal: ctrl.signal }); }
  finally { clearTimeout(timer); }
}

/** MyMemory free translation API — 5 000 chars/day, no key required */
async function translateToSk(text: string): Promise<string> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=en|sk`;
    const res  = await fetchWithTimeout(url, 8_000);
    if (!res.ok) return text;
    const json = await res.json() as { responseStatus: number; responseData?: { translatedText: string } };
    if (json.responseStatus === 200 && json.responseData?.translatedText) {
      const t = json.responseData.translatedText.trim();
      // MyMemory sometimes returns the original if it can't translate — detect
      return t && t.toLowerCase() !== text.toLowerCase() ? t : text;
    }
  } catch { /* fallback to original */ }
  return text;
}

function scoreItem(item: RssItem, token: OctToken): number {
  const text    = (item.title + ' ' + (item.description ?? '')).toLowerCase();
  let score     = 0;
  const ageMins = (Date.now() - new Date(item.pubDate).getTime()) / 60_000;
  if (ageMins <  60) score += 12;
  else if (ageMins < 360) score += 6;
  else if (ageMins < 720) score += 2;
  if (detectFlash(item.title).isFlash) score += 20;
  for (const kw of TOKEN_KEYWORDS[token]) if (text.includes(kw)) { score += 30; break; }
  return score;
}

// ─── localStorage cache per token ────────────────────────────────────────────

const CACHE_TTL = 20 * 60 * 1000; // 20 min

function cacheKey(token: OctToken) { return `macro-news-v3-${token}`; }

function readCache(token: OctToken): MacroNews | null {
  try {
    const raw = localStorage.getItem(cacheKey(token));
    if (!raw) return null;
    const { ts, item } = JSON.parse(raw) as { ts: number; item: MacroNews };
    if (Date.now() - ts > CACHE_TTL) return null;
    return item;
  } catch { return null; }
}

function writeCache(token: OctToken, item: MacroNews) {
  try {
    localStorage.setItem(cacheKey(token), JSON.stringify({ ts: Date.now(), item }));
  } catch { /* quota — ignore */ }
}

// ─── main fetch ───────────────────────────────────────────────────────────────

async function fetchTopNews(token: OctToken): Promise<MacroNews> {
  const tokenKws = TOKEN_KEYWORDS[token];

  for (const src of RSS_SOURCES) {
    try {
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(src.url)}&count=15`;
      const res    = await fetchWithTimeout(apiUrl, 10_000);
      if (!res.ok) continue;
      const json   = await res.json() as Rss2JsonResponse;
      if (json.status !== 'ok' || !json.items?.length) continue;

      const items = json.items.slice(0, 15);

      // Score all items; prefer token-specific, then general flash, then freshest
      const scored = items.map(i => ({ item: i, score: scoreItem(i, token) }));
      scored.sort((a, b) => b.score - a.score);
      const best = scored[0].item;

      // Detect if best matches this token
      const bodyLower   = (best.title + ' ' + (best.description ?? '')).toLowerCase();
      const tokenMatch  = tokenKws.some(kw => bodyLower.includes(kw));

      // Translate title to Slovak via MyMemory
      const titleSk = await translateToSk(best.title);
      const { isFlash, tag } = detectFlash(titleSk + ' ' + best.title);

      const news: MacroNews = {
        titleSk,
        titleEn:    best.title,
        url:        best.link,
        pubDate:    best.pubDate,
        source:     src.name,
        isFlash,
        flashTag:   tag,
        ageLabel:   ageLabel(best.pubDate),
        tokenMatch,
      };
      writeCache(token, news);
      return news;
    } catch { /* try next source */ }
  }

  throw new Error('all_sources_failed');
}

// ─── static per-token fallbacks ───────────────────────────────────────────────

const FALLBACKS: Record<OctToken, MacroNews> = {
  BTC: {
    titleSk: 'Pre BTC nie sú momentálne dostupné správy. Skontroluj CoinDesk ručne.',
    titleEn: 'No BTC news available. Check CoinDesk manually.',
    url: 'https://www.coindesk.com', pubDate: new Date().toISOString(),
    source: 'Fallback', isFlash: false, flashTag: '', ageLabel: '—', tokenMatch: false,
  },
  ETH: {
    titleSk: 'Pre ETH nie sú momentálne dostupné správy. Skontroluj Cointelegraph ručne.',
    titleEn: 'No ETH news available.',
    url: 'https://cointelegraph.com', pubDate: new Date().toISOString(),
    source: 'Fallback', isFlash: false, flashTag: '', ageLabel: '—', tokenMatch: false,
  },
  SOL: {
    titleSk: 'Pre SOL nie sú momentálne dostupné správy. Skontroluj The Block ručne.',
    titleEn: 'No SOL news available.',
    url: 'https://www.theblock.co', pubDate: new Date().toISOString(),
    source: 'Fallback', isFlash: false, flashTag: '', ageLabel: '—', tokenMatch: false,
  },
};

// ─── component ────────────────────────────────────────────────────────────────

interface Props { activeToken: OctToken }

const TOKEN_LABEL: Record<OctToken, string> = {
  BTC: 'Bitcoin', ETH: 'Ethereum', SOL: 'Solana',
};

export function MacroNewsTicker({ activeToken }: Props) {
  const [news,    setNews]    = useState<MacroNews | null>(() => readCache(activeToken));
  const [loading, setLoading] = useState(!readCache(activeToken));
  const [apiErr,  setApiErr]  = useState(false);

  const load = useCallback(async (token: OctToken) => {
    // Serve cache instantly if fresh
    const cached = readCache(token);
    if (cached) { setNews(cached); setLoading(false); return; }

    setLoading(true);
    setApiErr(false);
    try {
      const item = await fetchTopNews(token);
      setNews(item);
    } catch {
      setNews(FALLBACKS[token]);
      setApiErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when token changes
  useEffect(() => {
    void load(activeToken);
    const id = setInterval(() => { void load(activeToken); }, CACHE_TTL);
    return () => clearInterval(id);
  }, [activeToken, load]);

  const isFlash = !!news?.isFlash;
  const tokenColor: Record<OctToken, string> = {
    BTC: '#F7931A', ETH: '#627EEA', SOL: '#9945FF',
  };

  return (
    <div
      className={`glass-card p-3 transition-all ${
        isFlash ? 'border-amber-500/40 bg-amber-500/5' : ''
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-1.5 mb-2">
        <Radio className="w-3 h-3 text-muted-foreground" />
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
            Makro správy
          </p>
          {/* Token badge */}
          <span
            className="px-1.5 py-0.5 rounded text-[8px] font-bold text-background"
            style={{ backgroundColor: tokenColor[activeToken] }}
          >
            {activeToken}
          </span>
          {!loading && news?.tokenMatch && (
            <span className="text-[8px] text-muted-foreground/50">· špecifické pre {TOKEN_LABEL[activeToken]}</span>
          )}
        </div>
        {isFlash && (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 shrink-0">
            <Zap className="w-2.5 h-2.5 text-amber-400" />
            <span className="text-[8px] font-bold text-amber-400 uppercase tracking-wide">
              Flash · {news?.flashTag}
            </span>
          </span>
        )}
        <button
          onClick={() => { void load(activeToken); }}
          disabled={loading}
          className="p-0.5 rounded hover:bg-secondary transition-colors disabled:opacity-40 shrink-0"
          title="Obnoviť správy"
        >
          <RefreshCw className={`w-3 h-3 text-muted-foreground ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="space-y-1.5 py-1">
          <div className="h-3 bg-secondary/50 rounded animate-pulse w-full" />
          <div className="h-3 bg-secondary/30 rounded animate-pulse w-4/5" />
          <div className="h-2.5 bg-secondary/20 rounded animate-pulse w-1/3 mt-1" />
        </div>
      )}

      {/* Content */}
      {!loading && news && (
        <>
          {apiErr && (
            <div className="flex items-center gap-1.5 mb-1.5 text-[9px] text-rose-400/80">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              RSS nedostupné — zobrazený fallback
            </div>
          )}

          <a
            href={news.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`group flex items-start gap-2 rounded-lg p-2 transition-colors hover:bg-secondary/40 ${
              isFlash ? 'bg-amber-500/8' : 'bg-secondary/20'
            }`}
          >
            {isFlash
              ? <Zap   className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
              : <Radio className="w-3.5 h-3.5 text-muted-foreground/40 mt-0.5 shrink-0" />
            }
            <div className="flex-1 min-w-0">
              <p className={`text-[11px] font-semibold leading-snug ${
                isFlash ? 'text-amber-100' : 'text-foreground'
              }`}>
                {news.titleSk}
              </p>
              {/* Show English original if translation differs */}
              {news.titleSk !== news.titleEn && (
                <p className="text-[9px] text-muted-foreground/40 mt-0.5 italic leading-tight line-clamp-1">
                  {news.titleEn}
                </p>
              )}
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[9px] text-muted-foreground font-medium">{news.source}</span>
                <span className="text-[9px] text-muted-foreground/40">·</span>
                <span className="text-[9px] text-muted-foreground/60 tabular-nums">{news.ageLabel}</span>
              </div>
            </div>
            <ExternalLink className="w-3 h-3 text-muted-foreground/30 group-hover:text-muted-foreground shrink-0 mt-0.5 transition-colors" />
          </a>
        </>
      )}

      {/* Footer */}
      <p className="text-[9px] text-muted-foreground/40 text-center mt-2">
        Správy: CoinDesk / Cointelegraph / The Block RSS (Preložené · MyMemory free)
      </p>
    </div>
  );
}

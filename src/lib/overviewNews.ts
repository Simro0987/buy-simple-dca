import { cgFetch } from '@/lib/coingecko';

export type NewsAsset = 'BTC' | 'ETH' | 'SOL' | 'MAKRO';
export type NewsFilter = 'ALL' | NewsAsset;
export type NewsSentiment = 'bullish' | 'bearish' | 'neutral';

export type NewsProvider =
  | 'cointelegraph'
  | 'coindesk'
  | 'theblock'
  | 'cryptocompare'
  | 'coingecko';

/** Normalized article shape from any news API adapter. */
export interface UnifiedArticle {
  id: string;
  title: string;
  url: string;
  imageUrl?: string;
  sourceName: string;
  publishedAt: string;
  body?: string;
  upvotes?: number;
  categories?: string;
  provider: NewsProvider;
}

export interface OverviewNewsItem {
  id: string;
  asset: NewsAsset;
  isFlashAlert: boolean;
  tag?: string;
  title: string;
  detail?: string;
  source: string;
  publishedAt: string;
  imageUrl?: string;
  articleUrl: string;
  upvotes?: number;
  comments?: number;
  impact?: 'high' | 'medium' | 'low';
  sentiment?: NewsSentiment;
}

export const NEWS_INITIAL_VISIBLE = 8;
export const NEWS_LOAD_MORE_COUNT = 6;
export const NEWS_FETCH_LIMIT = 50;
export const NEWS_AUTO_REFRESH_MS = 180_000;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const BULLISH_KEYWORDS = /\b(surge|rally|bullish|gain|rise|soar|boom|breakout|approval|approved|adoption|ath|all-time high|inflow|accumulate)\b/i;
const BEARISH_KEYWORDS = /\b(crash|drop|bearish|plunge|dump|decline|loss|sell-off|hack|exploit|stolen|fraud|ban|rejected|delist|bankrupt|collapse|outflow|liquidat)\b/i;
const FLASH_TITLE_KEYWORDS = /\b(breaking|alert|flash|urgent|just in)\b/i;
const MACRO_KEYWORDS = /\b(market|regulation|etf|sec|fed|rate|macro|economy|fomc|inflation|cpi|treasury|central bank|interest rate|liquidity)\b/i;
const ASSET_PRIORITY: NewsAsset[] = ['BTC', 'ETH', 'SOL'];

const TAB_MATCHERS: Record<Exclude<NewsFilter, 'ALL'>, RegExp> = {
  BTC: /\b(btc|bitcoin)\b/i,
  ETH: /\b(eth|ethereum|ether)\b/i,
  SOL: /\b(sol|solana)\b/i,
  MAKRO: /\b(market|regulation|etf|sec|fed|rate|macro|economy)\b/i,
};

const RSS2JSON_FEEDS: Array<{ provider: NewsProvider; sourceName: string; rssUrl: string }> = [
  {
    provider: 'cointelegraph',
    sourceName: 'Cointelegraph',
    rssUrl: 'https://cointelegraph.com/rss',
  },
  {
    provider: 'coindesk',
    sourceName: 'CoinDesk',
    rssUrl: 'https://www.coindesk.com/arc/outboundfeeds/rss/',
  },
  {
    provider: 'theblock',
    sourceName: 'The Block',
    rssUrl: 'https://www.theblock.co/rss.xml',
  },
];

export function inferSentiment(text: string): NewsSentiment {
  const bull = BULLISH_KEYWORDS.test(text);
  const bear = BEARISH_KEYWORDS.test(text);
  if (bull && !bear) return 'bullish';
  if (bear && !bull) return 'bearish';
  return 'neutral';
}

export function getNewsEngagement(item: OverviewNewsItem): number {
  return (item.upvotes ?? 0) + (item.comments ?? 0);
}

export function articleSearchBlob(item: Pick<OverviewNewsItem, 'title' | 'detail'>): string {
  return `${item.title} ${item.detail ?? ''}`;
}

/** Local keyword filter — tabs never depend on API query params. */
export function filterNewsByTab(items: OverviewNewsItem[], filter: NewsFilter): OverviewNewsItem[] {
  if (filter === 'ALL') return items;
  const pattern = TAB_MATCHERS[filter];
  return items.filter(item => pattern.test(articleSearchBlob(item)));
}

export function isFlashAlert(input: {
  title: string;
  categories?: string;
  upvotes?: number;
  body?: string;
}): boolean {
  const title = String(input.title ?? '');
  const categories = String(input.categories ?? '').toLowerCase();
  const body = String(input.body ?? '');
  const upvotes = Number(input.upvotes ?? 0) || 0;

  if (upvotes > 20) return true;
  if (categories.includes('breaking')) return true;
  if (FLASH_TITLE_KEYWORDS.test(title)) return true;
  if (FLASH_TITLE_KEYWORDS.test(body)) return true;
  return false;
}

export function pickTopStory(articles: OverviewNewsItem[]): OverviewNewsItem | null {
  if (articles.length === 0) return null;

  const now = Date.now();
  const recent = articles.filter(item => {
    const ts = Date.parse(item.publishedAt);
    return Number.isFinite(ts) && now - ts <= TWENTY_FOUR_HOURS_MS;
  });
  const pool = recent.length > 0 ? recent : [...articles];

  const byEngagement = [...pool]
    .filter(item => getNewsEngagement(item) > 0)
    .sort((a, b) => {
      const diff = getNewsEngagement(b) - getNewsEngagement(a);
      if (diff !== 0) return diff;
      return Date.parse(b.publishedAt) - Date.parse(a.publishedAt);
    });
  if (byEngagement.length > 0) return byEngagement[0];

  const breaking = pool.find(item => item.isFlashAlert);
  if (breaking) return breaking;

  return [...pool].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  )[0];
}

export function splitTopStory(articles: OverviewNewsItem[]): {
  topStory: OverviewNewsItem | null;
  remainingArticles: OverviewNewsItem[];
} {
  const topStory = pickTopStory(articles);
  if (!topStory) return { topStory: null, remainingArticles: articles };

  return {
    topStory,
    remainingArticles: articles.filter(item => item.id !== topStory.id),
  };
}

function detectAssets(text: string): NewsAsset[] {
  const upper = text.toUpperCase();
  const found: NewsAsset[] = [];
  if (/\bBTC\b/.test(upper) || /\bBITCOIN\b/.test(upper)) found.push('BTC');
  if (/\bETH\b/.test(upper) || /\bETHEREUM\b/.test(upper) || /\bETHER\b/.test(upper)) found.push('ETH');
  if (/\bSOL\b/.test(upper) || /\bSOLANA\b/.test(upper)) found.push('SOL');
  return found;
}

function resolvePrimaryAsset(text: string): NewsAsset {
  const assets = detectAssets(text);
  for (const sym of ASSET_PRIORITY) {
    if (assets.includes(sym)) return sym;
  }
  if (MACRO_KEYWORDS.test(text)) return 'MAKRO';
  return 'MAKRO';
}

function flashTagFromText(title: string, categories?: string): string | undefined {
  if (/\bbreaking\b/i.test(title) || String(categories ?? '').toLowerCase().includes('breaking')) {
    return 'Breaking';
  }
  if (/\bflash\b/i.test(title)) return 'Flash';
  if (/\balert\b/i.test(title)) return 'Alert';
  if (/\bjust in\b/i.test(title)) return 'Just In';
  if (/\betf\b/i.test(title)) return 'ETF';
  if (/\bsec\b/i.test(title)) return 'SEC';
  if (/\bfed\b/i.test(title)) return 'Fed';
  return undefined;
}

function normalizePublishedAt(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value > 1e12 ? value : value * 1000;
    return new Date(ms).toISOString();
  }
  const parsed = Date.parse(String(value ?? ''));
  if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  return new Date().toISOString();
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sortUnifiedByRecency(articles: UnifiedArticle[]): UnifiedArticle[] {
  return [...articles].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

/** Deduplicate by normalized title — keeps the newest occurrence (array must be pre-sorted desc). */
export function dedupeUnifiedArticles(articles: UnifiedArticle[]): UnifiedArticle[] {
  const seenTitles = new Set<string>();

  return articles.filter(article => {
    const titleKey = article.title.trim().toLowerCase();
    if (!titleKey) return false;
    if (seenTitles.has(titleKey)) return false;
    seenTitles.add(titleKey);
    return true;
  });
}

export function dedupeNews(items: OverviewNewsItem[]): OverviewNewsItem[] {
  const seenTitles = new Set<string>();
  return items.filter(item => {
    const titleKey = item.title.trim().toLowerCase();
    if (seenTitles.has(titleKey)) return false;
    seenTitles.add(titleKey);
    return true;
  });
}

function enrichToOverviewItem(article: UnifiedArticle): OverviewNewsItem | null {
  const title = article.title.trim();
  const articleUrl = article.url.trim();
  if (!title || !articleUrl) return null;

  const body = String(article.body ?? '').trim();
  const blob = `${title} ${body} ${article.categories ?? ''}`;
  const asset = resolvePrimaryAsset(blob);
  const upvotes = Number(article.upvotes ?? 0) || 0;
  const flash = isFlashAlert({
    title,
    categories: article.categories,
    upvotes,
    body,
  });

  return {
    id: article.id,
    asset,
    isFlashAlert: flash,
    tag: flash ? flashTagFromText(title, article.categories) : undefined,
    title,
    detail: body.slice(0, 220) || undefined,
    source: article.sourceName,
    publishedAt: article.publishedAt,
    imageUrl: article.imageUrl,
    articleUrl,
    upvotes,
    sentiment: inferSentiment(blob),
  };
}

function sortByRecency(items: OverviewNewsItem[]): OverviewNewsItem[] {
  return [...items].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt),
  );
}

// ─── RSS2JSON adapters (Cointelegraph, CoinDesk, The Block) ─────────────────

interface Rss2JsonItem {
  title?: string;
  pubDate?: string;
  link?: string;
  description?: string;
  thumbnail?: string;
  enclosure?: { link?: string };
  guid?: string;
}

interface Rss2JsonResponse {
  status?: string;
  message?: string;
  items?: Rss2JsonItem[];
}

function extractRssImage(item: Rss2JsonItem): string | undefined {
  const thumb = String(item.thumbnail ?? '').trim();
  if (thumb) return thumb;

  const enclosure = String(item.enclosure?.link ?? '').trim();
  if (enclosure && /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(enclosure)) return enclosure;

  const html = String(item.description ?? '');
  const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  return match?.[1]?.trim() || undefined;
}

export function normalizeRss2JsonArticles(
  rows: Rss2JsonItem[],
  provider: NewsProvider,
  sourceName: string,
): UnifiedArticle[] {
  return rows
    .map((row, index): UnifiedArticle | null => {
      const title = stripHtml(String(row.title ?? '')).trim();
      const url = String(row.link ?? '').trim();
      if (!title || !url) return null;

      const description = stripHtml(String(row.description ?? '')).trim();

      return {
        id: `${provider}-${row.guid ?? index}`,
        title,
        url,
        imageUrl: extractRssImage(row),
        sourceName,
        publishedAt: normalizePublishedAt(row.pubDate),
        body: description || undefined,
        provider,
      };
    })
    .filter((item): item is UnifiedArticle => item !== null);
}

function buildRss2JsonUrl(rssUrl: string): string {
  const url = new URL('https://api.rss2json.com/v1/api.json');
  url.searchParams.set('rss_url', rssUrl);
  const apiKey = import.meta.env.VITE_RSS2JSON_API_KEY as string | undefined;
  if (apiKey) url.searchParams.set('api_key', apiKey);
  return url.toString();
}

async function fetchRss2JsonPayload(
  provider: NewsProvider,
  sourceName: string,
  rssUrl: string,
): Promise<UnifiedArticle[]> {
  const res = await fetch(buildRss2JsonUrl(rssUrl), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${sourceName} RSS2JSON HTTP ${res.status}`);

  const json = await res.json() as Rss2JsonResponse;
  if (json.status && json.status !== 'ok') {
    throw new Error(json.message || `${sourceName} RSS2JSON error`);
  }

  const rows = Array.isArray(json.items) ? json.items : [];
  if (rows.length === 0) throw new Error(`${sourceName} RSS2JSON returned empty feed`);
  return normalizeRss2JsonArticles(rows, provider, sourceName);
}

// ─── CryptoCompare adapter ───────────────────────────────────────────────────

interface CryptoCompareArticle {
  id?: string | number;
  guid?: string;
  title?: string;
  body?: string;
  url?: string;
  source?: string;
  source_info?: { name?: string };
  published_on?: number;
  imageurl?: string;
  categories?: string;
  tags?: string;
  upvotes?: string | number;
}

export function normalizeCryptoCompareArticles(rows: CryptoCompareArticle[]): UnifiedArticle[] {
  return rows
    .map((row, index): UnifiedArticle | null => {
      const title = String(row.title ?? '').trim();
      const url = String(row.url ?? '').trim();
      if (!title || !url) return null;

      return {
        id: `cc-${row.id ?? row.guid ?? index}`,
        title,
        url,
        imageUrl: String(row.imageurl ?? '').trim() || undefined,
        sourceName: String(row.source_info?.name ?? row.source ?? 'CryptoCompare').trim(),
        publishedAt: normalizePublishedAt(row.published_on),
        body: String(row.body ?? '').trim() || undefined,
        upvotes: Number(row.upvotes ?? 0) || undefined,
        categories: String(row.categories ?? '').trim() || undefined,
        provider: 'cryptocompare',
      };
    })
    .filter((item): item is UnifiedArticle => item !== null);
}

async function fetchCryptoComparePayload(): Promise<UnifiedArticle[]> {
  const apiKey = import.meta.env.VITE_CRYPTOCOMPARE_API_KEY as string | undefined;
  const url = new URL('https://min-api.cryptocompare.com/data/v2/news/');
  url.searchParams.set('lang', 'EN');
  url.searchParams.set('limit', String(NEWS_FETCH_LIMIT));
  if (apiKey) url.searchParams.set('api_key', apiKey);

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CryptoCompare HTTP ${res.status}`);

  const json = await res.json() as { Data?: CryptoCompareArticle[]; Err?: { message?: string } };
  if (json.Err?.message) throw new Error(json.Err.message);

  const rows = Array.isArray(json.Data) ? json.Data : [];
  if (rows.length === 0) throw new Error('CryptoCompare returned empty feed');
  return normalizeCryptoCompareArticles(rows);
}

// ─── CoinGecko adapter ───────────────────────────────────────────────────────

interface CoinGeckoNewsRow {
  id?: string | number;
  title?: string;
  description?: string;
  url?: string;
  thumb_2x?: string;
  author?: string;
  news_site?: string;
  published_at?: string;
  updated_at?: string;
}

export function normalizeCoinGeckoArticles(rows: CoinGeckoNewsRow[]): UnifiedArticle[] {
  return rows
    .map((row, index): UnifiedArticle | null => {
      const title = String(row.title ?? '').trim();
      const url = String(row.url ?? '').trim();
      if (!title || !url) return null;

      return {
        id: `cg-${row.id ?? index}`,
        title,
        url,
        imageUrl: String(row.thumb_2x ?? '').trim() || undefined,
        sourceName: String(row.news_site ?? row.author ?? 'CoinGecko').trim(),
        publishedAt: normalizePublishedAt(row.published_at ?? row.updated_at),
        body: String(row.description ?? '').trim() || undefined,
        provider: 'coingecko',
      };
    })
    .filter((item): item is UnifiedArticle => item !== null);
}

async function fetchCoinGeckoPayload(): Promise<UnifiedArticle[]> {
  const res = await cgFetch('/news');
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);

  const json = await res.json() as { data?: CoinGeckoNewsRow[]; status?: { error_message?: string } };
  if (json.status?.error_message) throw new Error(json.status.error_message);

  const rows = Array.isArray(json.data) ? json.data : [];
  if (rows.length === 0) throw new Error('CoinGecko returned empty feed');
  return normalizeCoinGeckoArticles(rows);
}

export interface AggregatedNewsResult {
  items: OverviewNewsItem[];
  meta: {
    cointelegraphCount: number;
    coindeskCount: number;
    theBlockCount: number;
    cryptoCompareCount: number;
    coinGeckoCount: number;
    mergedCount: number;
    errors: string[];
  };
}

/**
 * Fetch from 5 premium sources concurrently via Promise.allSettled.
 * Cointelegraph · CoinDesk · The Block · CryptoCompare · CoinGecko
 */
export async function fetchAggregatedNews(): Promise<AggregatedNewsResult> {
  const results = await Promise.allSettled([
    fetchRss2JsonPayload('cointelegraph', 'Cointelegraph', RSS2JSON_FEEDS[0].rssUrl),
    fetchRss2JsonPayload('coindesk', 'CoinDesk', RSS2JSON_FEEDS[1].rssUrl),
    fetchRss2JsonPayload('theblock', 'The Block', RSS2JSON_FEEDS[2].rssUrl),
    fetchCryptoComparePayload(),
    fetchCoinGeckoPayload(),
  ]);

  const sourceLabels = [
    'Cointelegraph',
    'CoinDesk',
    'The Block',
    'CryptoCompare',
    'CoinGecko',
  ] as const;

  const errors: string[] = [];
  const unified: UnifiedArticle[] = [];
  const counts = {
    cointelegraphCount: 0,
    coindeskCount: 0,
    theBlockCount: 0,
    cryptoCompareCount: 0,
    coinGeckoCount: 0,
  };

  results.forEach((result, index) => {
    const label = sourceLabels[index];
    if (result.status === 'fulfilled') {
      const batch = result.value;
      unified.push(...batch);
      if (index === 0) counts.cointelegraphCount = batch.length;
      if (index === 1) counts.coindeskCount = batch.length;
      if (index === 2) counts.theBlockCount = batch.length;
      if (index === 3) counts.cryptoCompareCount = batch.length;
      if (index === 4) counts.coinGeckoCount = batch.length;
    } else {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      errors.push(`${label}: ${reason}`);
    }
  });

  const deduped = dedupeUnifiedArticles(sortUnifiedByRecency(unified));
  const items = sortByRecency(
    deduped
      .map(enrichToOverviewItem)
      .filter((item): item is OverviewNewsItem => item !== null),
  );

  if (items.length === 0) {
    throw new Error(errors.join(' · ') || 'All news sources failed');
  }

  return {
    items,
    meta: {
      ...counts,
      mergedCount: items.length,
      errors,
    },
  };
}

/** Back-compat wrapper used by the news hook. */
export async function fetchOverviewNews(): Promise<OverviewNewsItem[]> {
  const { items } = await fetchAggregatedNews();
  return items;
}

export function formatLastUpdated(timestampMs: number, sk: boolean): string {
  if (!Number.isFinite(timestampMs) || timestampMs <= 0) return '';
  return new Intl.DateTimeFormat(sk ? 'sk-SK' : 'en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(timestampMs));
}

export function formatNewsTimeAgo(dateStr: string, sk: boolean): string {
  const ts = Date.parse(dateStr);
  if (!Number.isFinite(ts)) return '';

  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 45) return sk ? 'práve teraz' : 'just now';

  const mins = Math.floor(secs / 60);
  if (mins < 60) {
    return sk
      ? `pred ${mins} min`
      : `${mins} min${mins === 1 ? '' : 's'} ago`;
  }

  const hours = Math.floor(mins / 60);
  if (hours < 24) {
    return sk
      ? `pred ${hours} hod`
      : `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return sk
      ? `pred ${days} d`
      : `${days} day${days === 1 ? '' : 's'} ago`;
  }

  const weeks = Math.floor(days / 7);
  return sk
    ? `pred ${weeks} týž`
    : `${weeks} week${weeks === 1 ? '' : 's'} ago`;
}

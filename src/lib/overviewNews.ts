import { cgFetch } from '@/lib/coingecko';
import { supabase } from '@/integrations/supabase/client';

export type NewsAsset = 'BTC' | 'ETH' | 'SOL' | 'MAKRO';
export type NewsFilter = 'ALL' | NewsAsset;
export type NewsSentiment = 'bullish' | 'bearish' | 'neutral';

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

export interface OverviewNewsPage {
  items: OverviewNewsItem[];
  nextCursor?: number;
}

export const NEWS_INITIAL_VISIBLE = 8;
export const NEWS_LOAD_MORE_COUNT = 6;
export const NEWS_CC_PAGE_SIZE = 30;

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

const BULLISH_KEYWORDS = /\b(surge|rally|bullish|gain|rise|soar|boom|breakout|approval|approved|adoption|ath|all-time high|inflow|accumulate)\b/i;
const BEARISH_KEYWORDS = /\b(crash|drop|bearish|plunge|dump|decline|loss|sell-off|hack|exploit|stolen|fraud|ban|rejected|delist|bankrupt|collapse|outflow|liquidat)\b/i;

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

export function filterNewsByTab(items: OverviewNewsItem[], filter: NewsFilter): OverviewNewsItem[] {
  if (filter === 'ALL') return items;
  return items.filter(item => item.asset === filter);
}

/** CryptoCompare `categories` query param for each Noviny tab. */
export function newsFilterToCryptoCompareCategories(filter: NewsFilter): string | undefined {
  if (filter === 'ALL') return undefined;
  if (filter === 'MAKRO') return 'Market,Regulation,Fiat';
  return filter;
}

function assetForFetchedFilter(filter: NewsFilter | undefined, blob: string): NewsAsset {
  if (filter === 'BTC' || filter === 'ETH' || filter === 'SOL' || filter === 'MAKRO') {
    return filter;
  }
  return resolvePrimaryAsset(blob);
}

/** Pick the day's headline: highest 24h engagement → first breaking → newest. */
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

const FLASH_TITLE_KEYWORDS = /\b(breaking|alert|flash|urgent|just in)\b/i;
const MACRO_KEYWORDS = /\b(fed|fomc|inflation|cpi|macro|regulation|sec\b|etf|treasury|central bank|interest rate|liquidity)\b/i;

const ASSET_PRIORITY: NewsAsset[] = ['BTC', 'ETH', 'SOL'];

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

function normalizeSentiment(value: unknown): NewsSentiment | undefined {
  const v = String(value ?? '').toLowerCase();
  if (v === 'bullish' || v === 'bearish' || v === 'neutral') return v;
  return undefined;
}

function nextCryptoCompareCursor(items: OverviewNewsItem[], limit: number): number | undefined {
  if (items.length < limit) return undefined;
  const oldest = items.reduce((min, item) => {
    const ts = Date.parse(item.publishedAt);
    return ts < min ? ts : min;
  }, Date.parse(items[0]?.publishedAt ?? ''));
  if (!Number.isFinite(oldest)) return undefined;
  return Math.floor(oldest / 1000) - 1;
}

// ─── CryptoCompare ───────────────────────────────────────────────────────────

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

async function fetchCryptoCompareNews(options?: {
  lTs?: number;
  limit?: number;
  filter?: NewsFilter;
}): Promise<OverviewNewsItem[]> {
  const apiKey = import.meta.env.VITE_CRYPTOCOMPARE_API_KEY as string | undefined;
  const limit = options?.limit ?? NEWS_CC_PAGE_SIZE;
  const categories = options?.filter
    ? newsFilterToCryptoCompareCategories(options.filter)
    : undefined;

  const url = new URL('https://min-api.cryptocompare.com/data/v2/news/');
  url.searchParams.set('lang', 'EN');
  url.searchParams.set('limit', String(limit));
  if (categories) url.searchParams.set('categories', categories);
  if (options?.lTs) url.searchParams.set('lTs', String(options.lTs));
  if (apiKey) url.searchParams.set('api_key', apiKey);

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`CryptoCompare HTTP ${res.status}`);

  const json = await res.json() as { Data?: CryptoCompareArticle[]; Err?: { message?: string } };
  if (json.Err?.message) throw new Error(json.Err.message);
  const rows = Array.isArray(json.Data) ? json.Data : [];
  if (rows.length === 0) throw new Error('CryptoCompare returned empty feed');

  return rows
    .map((row, index): OverviewNewsItem | null => {
      const title = String(row.title ?? '').trim();
      const articleUrl = String(row.url ?? '').trim();
      if (!title || !articleUrl) return null;

      const body = String(row.body ?? '').trim();
      const blob = `${title} ${body} ${row.categories ?? ''} ${row.tags ?? ''}`;
      const asset = assetForFetchedFilter(options?.filter, blob);
      const upvotes = Number(row.upvotes ?? 0) || 0;
      const flash = isFlashAlert({
        title,
        categories: row.categories,
        upvotes,
        body,
      });

      return {
        id: String(row.id ?? row.guid ?? `cc-${options?.lTs ?? '0'}-${index}`),
        asset,
        isFlashAlert: flash,
        tag: flash ? flashTagFromText(title, row.categories) : undefined,
        title,
        detail: body.slice(0, 220) || undefined,
        source: String(row.source_info?.name ?? row.source ?? 'CryptoCompare').trim(),
        publishedAt: normalizePublishedAt(row.published_on),
        imageUrl: String(row.imageurl ?? '').trim() || undefined,
        articleUrl,
        upvotes,
        sentiment: inferSentiment(blob),
      };
    })
    .filter((item): item is OverviewNewsItem => item !== null);
}

// ─── CoinGecko ───────────────────────────────────────────────────────────────

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

async function fetchCoinGeckoNews(): Promise<OverviewNewsItem[]> {
  const res = await cgFetch('/news');
  if (!res.ok) throw new Error(`CoinGecko HTTP ${res.status}`);

  const json = await res.json() as { data?: CoinGeckoNewsRow[]; status?: { error_message?: string } };
  if (json.status?.error_message) throw new Error(json.status.error_message);

  const rows = Array.isArray(json.data) ? json.data : [];
  if (rows.length === 0) throw new Error('CoinGecko returned empty feed');

  return rows
    .map((row, index): OverviewNewsItem | null => {
      const title = String(row.title ?? '').trim();
      const articleUrl = String(row.url ?? '').trim();
      if (!title || !articleUrl) return null;

      const description = String(row.description ?? '').trim();
      const blob = `${title} ${description}`;
      const asset = resolvePrimaryAsset(blob);
      const flash = isFlashAlert({ title, body: description });

      return {
        id: String(row.id ?? `cg-${index}`),
        asset,
        isFlashAlert: flash,
        tag: flash ? flashTagFromText(title) : undefined,
        title,
        detail: description.slice(0, 220) || undefined,
        source: String(row.news_site ?? row.author ?? 'CoinGecko').trim(),
        publishedAt: normalizePublishedAt(row.published_at ?? row.updated_at),
        imageUrl: String(row.thumb_2x ?? '').trim() || undefined,
        articleUrl,
        sentiment: inferSentiment(blob),
      };
    })
    .filter((item): item is OverviewNewsItem => item !== null);
}

// ─── Supabase RSS aggregator (final fallback) ────────────────────────────────

interface FallbackNewsRow {
  id: number | string;
  title: string;
  summary?: string;
  url: string;
  source: string;
  publishedAt: string;
  tokens?: string[];
  impact?: string;
  flash?: boolean;
  sentiment?: string;
}

async function fetchSupabaseNewsFallback(lang: string): Promise<OverviewNewsItem[]> {
  const { data, error } = await supabase.functions.invoke('crypto-news', {
    body: { currencies: 'BTC,ETH,SOL', kind: 'news', lang, t: Date.now() },
  });
  if (error) throw new Error(error.message);
  if (!data?.success) throw new Error(data?.error || 'Supabase news fallback failed');

  const rows = (data.data ?? []) as FallbackNewsRow[];
  return rows.map((row, index) => {
    const title = String(row.title ?? '').trim();
    const summary = String(row.summary ?? '').trim();
    const blob = `${title} ${summary}`;
    const tokenAsset = (row.tokens ?? [])
      .map(t => String(t).toUpperCase())
      .find(t => ASSET_PRIORITY.includes(t as NewsAsset)) as NewsAsset | undefined;

    const asset = tokenAsset ?? resolvePrimaryAsset(blob);
    const flash = row.flash === true || isFlashAlert({ title, body: summary });
    const impact = row.impact === 'high' || row.impact === 'medium' || row.impact === 'low'
      ? row.impact
      : undefined;
    const sentiment = normalizeSentiment(row.sentiment) ?? inferSentiment(blob);

    return {
      id: String(row.id ?? `fb-${index}`),
      asset,
      isFlashAlert: flash,
      tag: flash ? flashTagFromText(title) : undefined,
      title,
      detail: summary.slice(0, 220) || undefined,
      source: String(row.source ?? 'RSS').trim(),
      publishedAt: normalizePublishedAt(row.publishedAt),
      articleUrl: String(row.url ?? '').trim(),
      impact,
      sentiment,
    };
  }).filter(item => item.title && item.articleUrl);
}

function prioritizePortfolioNews(items: OverviewNewsItem[]): OverviewNewsItem[] {
  const scored = items.map(item => {
    let score = 0;
    if (item.asset === 'BTC' || item.asset === 'ETH' || item.asset === 'SOL') score += 3;
    if (item.isFlashAlert) score += 5;
    return { item, score };
  });

  return scored
    .sort((a, b) => {
      if (a.item.isFlashAlert !== b.item.isFlashAlert) {
        return a.item.isFlashAlert ? -1 : 1;
      }
      if (a.score !== b.score) return b.score - a.score;
      return new Date(b.item.publishedAt).getTime() - new Date(a.item.publishedAt).getTime();
    })
    .map(s => s.item);
}

export function dedupeNews(items: OverviewNewsItem[]): OverviewNewsItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.title.toLowerCase().slice(0, 48);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchOverviewNewsPage(
  lang = 'sk',
  filter: NewsFilter = 'ALL',
  cursor?: number,
): Promise<OverviewNewsPage> {
  if (cursor !== undefined) {
    try {
      const items = await fetchCryptoCompareNews({
        lTs: cursor,
        limit: NEWS_CC_PAGE_SIZE,
        filter,
      });
      return {
        items: prioritizePortfolioNews(items),
        nextCursor: nextCryptoCompareCursor(items, NEWS_CC_PAGE_SIZE),
      };
    } catch {
      return { items: [] };
    }
  }

  const errors: string[] = [];

  for (const attempt of [
    async () => {
      const items = await fetchCryptoCompareNews({ limit: NEWS_CC_PAGE_SIZE, filter });
      return {
        items: prioritizePortfolioNews(items),
        nextCursor: nextCryptoCompareCursor(items, NEWS_CC_PAGE_SIZE),
      };
    },
    async () => ({
      items: prioritizePortfolioNews(filterNewsByTab(await fetchCoinGeckoNews(), filter)),
    }),
    async () => ({
      items: prioritizePortfolioNews(filterNewsByTab(await fetchSupabaseNewsFallback(lang), filter)),
    }),
  ]) {
    try {
      const page = await attempt();
      if (page.items.length > 0) return page;
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(errors.join(' · ') || 'All news sources failed');
}

/** @deprecated Use fetchOverviewNewsPage for pagination support */
export async function fetchOverviewNews(lang = 'sk', filter: NewsFilter = 'ALL'): Promise<OverviewNewsItem[]> {
  const page = await fetchOverviewNewsPage(lang, filter);
  return dedupeNews(page.items);
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

import { cgFetch } from '@/lib/coingecko';
import { supabase } from '@/integrations/supabase/client';

export type NewsAsset = 'BTC' | 'ETH' | 'SOL' | 'MAKRO';

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

async function fetchCryptoCompareNews(): Promise<OverviewNewsItem[]> {
  const apiKey = import.meta.env.VITE_CRYPTOCOMPARE_API_KEY as string | undefined;
  const url = new URL('https://min-api.cryptocompare.com/data/v2/news/');
  url.searchParams.set('lang', 'EN');
  url.searchParams.set('limit', '40');
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

      const blob = `${title} ${row.body ?? ''} ${row.categories ?? ''} ${row.tags ?? ''}`;
      const asset = resolvePrimaryAsset(blob);
      const flash = isFlashAlert({
        title,
        categories: row.categories,
        upvotes: Number(row.upvotes ?? 0) || 0,
        body: row.body,
      });

      return {
        id: String(row.id ?? row.guid ?? `cc-${index}`),
        asset,
        isFlashAlert: flash,
        tag: flash ? flashTagFromText(title, row.categories) : undefined,
        title,
        detail: String(row.body ?? '').trim().slice(0, 220) || undefined,
        source: String(row.source_info?.name ?? row.source ?? 'CryptoCompare').trim(),
        publishedAt: normalizePublishedAt(row.published_on),
        imageUrl: String(row.imageurl ?? '').trim() || undefined,
        articleUrl,
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

      const blob = `${title} ${row.description ?? ''}`;
      const asset = resolvePrimaryAsset(blob);
      const flash = isFlashAlert({ title, body: row.description });

      return {
        id: String(row.id ?? `cg-${index}`),
        asset,
        isFlashAlert: flash,
        tag: flash ? flashTagFromText(title) : undefined,
        title,
        detail: String(row.description ?? '').trim().slice(0, 220) || undefined,
        source: String(row.news_site ?? row.author ?? 'CoinGecko').trim(),
        publishedAt: normalizePublishedAt(row.published_at ?? row.updated_at),
        imageUrl: String(row.thumb_2x ?? '').trim() || undefined,
        articleUrl,
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
    const blob = `${title} ${row.summary ?? ''}`;
    const tokenAsset = (row.tokens ?? [])
      .map(t => String(t).toUpperCase())
      .find(t => ASSET_PRIORITY.includes(t as NewsAsset)) as NewsAsset | undefined;

    const asset = tokenAsset ?? resolvePrimaryAsset(blob);
    const flash = row.flash === true || isFlashAlert({ title, body: row.summary });

    return {
      id: String(row.id ?? `fb-${index}`),
      asset,
      isFlashAlert: flash,
      tag: flash ? flashTagFromText(title) : undefined,
      title,
      detail: String(row.summary ?? '').trim().slice(0, 220) || undefined,
      source: String(row.source ?? 'RSS').trim(),
      publishedAt: normalizePublishedAt(row.publishedAt),
      articleUrl: String(row.url ?? '').trim(),
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

function dedupeNews(items: OverviewNewsItem[]): OverviewNewsItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const key = item.title.toLowerCase().slice(0, 48);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchOverviewNews(lang = 'sk'): Promise<OverviewNewsItem[]> {
  const errors: string[] = [];

  for (const attempt of [
    () => fetchCryptoCompareNews(),
    () => fetchCoinGeckoNews(),
    () => fetchSupabaseNewsFallback(lang),
  ]) {
    try {
      const items = dedupeNews(prioritizePortfolioNews(await attempt()));
      if (items.length > 0) return items.slice(0, 40);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  throw new Error(errors.join(' · ') || 'All news sources failed');
}

export function formatNewsTimeAgo(dateStr: string, sk: boolean): string {
  const ts = Date.parse(dateStr);
  if (!Number.isFinite(ts)) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return sk ? 'teraz' : 'now';
  if (mins < 60) return `${mins}${sk ? ' min' : 'm'}`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}${sk ? ' hod' : 'h'}`;
  const days = Math.floor(hours / 24);
  return `${days}${sk ? ' d' : 'd'}`;
}

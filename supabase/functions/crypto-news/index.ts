const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Helpers ──────────────────────────────────────────────

function decodeEntities(input: string): string {
  if (!input) return '';
  let s = String(input);
  // Numeric entities (decimal + hex)
  s = s.replace(/&#(\d+);/g, (_, n) => {
    try { return String.fromCodePoint(parseInt(n, 10)); } catch { return ''; }
  });
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, h) => {
    try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ''; }
  });
  // Named entities (common set)
  const named: Record<string, string> = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
    mdash: '—', ndash: '–', hellip: '…', copy: '©', reg: '®', trade: '™',
  };
  s = s.replace(/&([a-zA-Z]+);/g, (m, name) => named[name] ?? m);
  // Strip stray HTML tags
  s = s.replace(/<[^>]*>/g, '');
  return s.replace(/\s+/g, ' ').trim();
}



async function translateTexts(texts: string[], lang: string): Promise<string[]> {
  if (lang === 'en' || texts.length === 0) return texts;
  try {
    return await Promise.all(
      texts.map(async (t) => {
        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(t)}`;
          const resp = await fetch(url);
          if (!resp.ok) return t;
          const data = await resp.json();
          return data?.[0]?.map((s: [string]) => s[0]).join('') || t;
        } catch { return t; }
      })
    );
  } catch { return texts; }
}

function detectTokens(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  if (/\bBTC\b/.test(upper) || /\bBITCOIN\b/.test(upper)) found.add('BTC');
  if (/\bETH\b/.test(upper) || /\bETHEREUM\b/.test(upper) || /\bETHER\b/.test(upper)) found.add('ETH');
  if (/\bSOL\b/.test(upper) || /\bSOLANA\b/.test(upper)) found.add('SOL');
  return [...found];
}

interface RawNewsItem {
  id: string | number;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  tokens: string[];
  description: string;
}

// ── Keyword-based Classification (fallback) ─────────────

const HIGH_IMPACT_KEYWORDS = [
  'etf', 'sec ', 'regulation', 'ban', 'hack', 'exploit', 'breach', 'stolen',
  'lawsuit', 'arrest', 'fraud', 'crash', 'collapse', 'bankrupt', 'insolvent',
  'federal reserve', 'central bank', 'cbdc', 'delist', 'shutdown', 'halving',
  'approval', 'approved', 'rejected', 'sanction', 'investigation', 'subpoena', 'fork',
];
const MEDIUM_IMPACT_KEYWORDS = [
  'partnership', 'upgrade', 'launch', 'listing', 'whale', 'stablecoin',
  'integration', 'adoption', 'fund', 'investment', 'acquisition', 'merge',
  'protocol', 'mainnet', 'testnet', 'airdrop', 'token', 'yield',
];
const BULLISH_KEYWORDS = [
  'surge', 'rally', 'bullish', 'gain', 'rise', 'soar', 'boom', 'breakout',
  'approval', 'approved', 'adoption', 'partnership', 'launch', 'upgrade',
  'ath', 'all-time high', 'institutional', 'inflow', 'accumulate',
];
const BEARISH_KEYWORDS = [
  'crash', 'drop', 'bearish', 'plunge', 'dump', 'decline', 'loss', 'sell-off',
  'hack', 'exploit', 'stolen', 'fraud', 'ban', 'rejected', 'delist',
  'bankrupt', 'collapse', 'outflow', 'liquidat',
];

function classifyByKeywords(title: string): { impact: 'high' | 'medium' | 'low'; sentiment: 'bullish' | 'bearish' | 'neutral' } {
  const lower = title.toLowerCase();
  const impact = HIGH_IMPACT_KEYWORDS.some(k => lower.includes(k)) ? 'high'
    : MEDIUM_IMPACT_KEYWORDS.some(k => lower.includes(k)) ? 'medium' : 'low';
  const bullScore = BULLISH_KEYWORDS.filter(k => lower.includes(k)).length;
  const bearScore = BEARISH_KEYWORDS.filter(k => lower.includes(k)).length;
  const sentiment = bullScore > bearScore ? 'bullish' : bearScore > bullScore ? 'bearish' : 'neutral';
  return { impact, sentiment };
}

// ── AI Classification with keyword fallback ─────────────

interface ClassifiedItem {
  impact: 'high' | 'medium' | 'low';
  sentiment: 'bullish' | 'bearish' | 'neutral';
  summary: string;
}

interface AIResult extends ClassifiedItem {
  translatedTitle?: string;
}

async function classifyWithAI(items: RawNewsItem[], lang: string): Promise<AIResult[]> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY || items.length === 0) {
    return items.map(item => ({ ...classifyByKeywords(item.title), summary: '' }));
  }

  const numbered = items
    .map((item, i) => `${i + 1}. TITLE: "${item.title}"${item.description ? `\n   CONTEXT: "${item.description.substring(0, 180)}"` : ''}`)
    .join('\n');
  const targetLang = lang === 'sk' ? 'Slovak (slovenčina)' : 'English';
  const wantTranslation = lang === 'sk';

  const prompt = `You are a crypto news analyst & translator for a Slovak portfolio tracker (BTC, ETH, SOL).

For EACH item:
1. Classify impact + sentiment.
2. ${wantTranslation ? `Translate the TITLE to natural, fluent ${targetLang}. Keep token tickers (BTC, ETH, SOL) and proper nouns in original form. NO transliteration of names.` : `Keep the original English title.`}
3. Write a one-sentence summary in ${targetLang} based on TITLE + CONTEXT.

Impact: "high" (ETF, regulation, hacks >$10M, delistings, central bank policy) | "medium" (partnerships, upgrades, whale moves, listings) | "low" (commentary, minor updates)
Sentiment: "bullish" | "bearish" | "neutral"

Items:
${numbered}

Return ONLY a JSON array (no markdown). Each object: {"impact":"...","sentiment":"...","title":"${wantTranslation ? 'translated title' : 'original title'}","summary":"one sentence in ${targetLang}"}
Array must have exactly ${items.length} items in order.`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    const resp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!resp.ok) {
      console.error(`AI gateway error [${resp.status}], falling back to keywords`);
      return items.map(item => ({ ...classifyByKeywords(item.title), summary: '' }));
    }

    const data = await resp.json();
    let content = data.choices?.[0]?.message?.content || '';
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(content);

    if (Array.isArray(parsed) && parsed.length === items.length) {
      return parsed.map((p: { impact?: string; sentiment?: string; summary?: string; title?: string }) => ({
        impact: ['high', 'medium', 'low'].includes(p.impact) ? p.impact : 'low',
        sentiment: ['bullish', 'bearish', 'neutral'].includes(p.sentiment) ? p.sentiment : 'neutral',
        summary: typeof p.summary === 'string' ? p.summary : '',
        translatedTitle: typeof p.title === 'string' ? p.title : undefined,
      }));
    }
    console.error('AI returned wrong array length:', parsed.length, 'expected:', items.length);
  } catch (e) {
    console.error('AI classification error, using keyword fallback:', e);
  }

  return items.map(item => ({ ...classifyByKeywords(item.title), summary: '' }));
}

// ── RSS Parsing ─────────────────────────────────────────

function parseRssItems(xml: string, sourceName: string, maxItems: number): RawNewsItem[] {
  const items: RawNewsItem[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  let count = 0;
  while ((match = itemRegex.exec(xml)) !== null && count < maxItems) {
    const block = match[1];
    const title = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/)?.[1] || '';
    const link = block.match(/<link>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/link>/)?.[1] ||
                 block.match(/<guid[^>]*>(.*?)<\/guid>/)?.[1] || '';
    const pubDate = block.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || '';
    const desc = block.match(/<description>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/description>/)?.[1] || '';
    const categories: string[] = [];
    const catRegex = /<category[^>]*>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/category>/g;
    let catMatch;
    while ((catMatch = catRegex.exec(block)) !== null) categories.push(catMatch[1]);
    const fullText = [title, desc, ...categories].join(' ');

    if (title) {
      items.push({
        id: `${sourceName.toLowerCase().replace(/\s/g, '')}-${count}-${Date.now()}`,
        title: title.trim(),
        url: link.trim(),
        source: sourceName,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        tokens: detectTokens(fullText),
        description: desc.replace(/<[^>]*>/g, '').substring(0, 200),
      });
      count++;
    }
  }
  return items;
}

// ── Data Sources ────────────────────────────────────────

async function fetchCryptoPanic(apiKey: string, coinFilter: string, kindFilter: string): Promise<RawNewsItem[]> {
  try {
    const url = `https://cryptopanic.com/api/developer/v2/posts/?auth_token=${apiKey}&currencies=${coinFilter}&kind=${kindFilter}&public=true`;
    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(url);
      if (response.ok) break;
      if (response.status >= 500 && attempt < 2) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      return [];
    }
    if (!response?.ok) return [];

    const data = await response.json();
    return (data.results || []).slice(0, 12).map((item: Record<string, unknown> & { source?: { title?: string; domain?: string }; original_url?: string; url?: string; instruments?: Array<{ code: string }>; currencies?: Array<{ code: string }>; title?: string; id?: string | number; published_at?: string }) => {
      const sourceName = item.source?.title || item.source?.domain || '';
      const itemUrl = item.original_url || item.url || '';
      let domainSource = sourceName;
      if (!domainSource && itemUrl) {
        try { domainSource = new URL(itemUrl).hostname.replace('www.', ''); } catch { /* ignore */ }
      }
      let tokens = (item.instruments || item.currencies || []).map((c: { code: string }) => c.code);
      if (tokens.length === 0) tokens = detectTokens(item.title || '');
      return {
        id: item.id || Date.now(),
        title: item.title,
        url: itemUrl,
        source: domainSource || 'CryptoPanic',
        publishedAt: item.published_at,
        tokens,
        description: '',
      };
    });
  } catch (e) {
    console.error('CryptoPanic error:', e);
    return [];
  }
}

async function fetchRssFeed(feedUrl: string, sourceName: string, maxItems = 8): Promise<RawNewsItem[]> {
  try {
    const resp = await fetch(feedUrl);
    if (!resp.ok) return [];
    const xml = await resp.text();
    return parseRssItems(xml, sourceName, maxItems);
  } catch (e) {
    console.error(`${sourceName} RSS error:`, e);
    return [];
  }
}

// Premium "Big Five" feeds
const PREMIUM_FEEDS: Array<{ url: string; name: string }> = [
  { url: 'https://www.coindesk.com/arc/outboundfeeds/rss/', name: 'CoinDesk' },
  { url: 'https://cointelegraph.com/rss', name: 'CoinTelegraph' },
  { url: 'https://decrypt.co/feed', name: 'Decrypt' },
  { url: 'https://www.theblock.co/rss.xml', name: 'The Block' },
  { url: 'https://blockworks.co/feed', name: 'Blockworks' },
];

// ── Main Handler ────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { currencies, kind, lang } = await req.json();
    const coinFilter = currencies || 'BTC,ETH,SOL';
    const allowed = new Set(coinFilter.split(',').map((s: string) => s.trim().toUpperCase()));
    const kindFilter = kind || 'news';
    const targetLang = lang || 'sk';
    const apiKey = Deno.env.get('CRYPTOPANIC_API_KEY');

    const results = await Promise.all([
      apiKey ? fetchCryptoPanic(apiKey, coinFilter, kindFilter) : Promise.resolve([]),
      ...PREMIUM_FEEDS.map(f => fetchRssFeed(f.url, f.name, 8)),
    ]);
    const allItems = results.flat();

    // STRICT FILTER: only items that mention an allowed portfolio token
    const portfolioOnly = allItems.filter(it => it.tokens.some(t => allowed.has(t.toUpperCase())));

    // Deduplicate
    const seen = new Set<string>();
    const unique = portfolioOnly.filter(item => {
      const key = item.title.toLowerCase().substring(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    const top = unique.slice(0, 24);

    // Sanitize HTML entities on titles & descriptions BEFORE translation
    for (const it of top) {
      it.title = decodeEntities(it.title);
      it.description = decodeEntities(it.description);
    }

    const classified = await classifyWithAI(top, targetLang);

    // Titles: use AI translation if available, otherwise Google Translate fallback
    const titlesNeedingFallback = top.map((item, i) => classified[i].translatedTitle ? null : item.title);
    const titlesToTranslate = titlesNeedingFallback.filter((t): t is string => t !== null);
    const fallbackTranslated = await translateTexts(titlesToTranslate, targetLang);
    let fbIdx = 0;
    const finalTitles = top.map((item, i) => {
      const t = classified[i].translatedTitle
        ? classified[i].translatedTitle!
        : (fallbackTranslated[fbIdx++] || item.title);
      return decodeEntities(t);
    });

    // Summaries: if AI missed, translate the source description as fallback
    const summariesNeedingFallback = top.map((item, i) =>
      classified[i].summary || !item.description ? null : item.description
    );

    const summariesToTranslate = summariesNeedingFallback.filter((s): s is string => s !== null);
    const fallbackSummaries = await translateTexts(summariesToTranslate, targetLang);
    let sIdx = 0;
    const finalSummaries = top.map((item, i) => {
      if (classified[i].summary) return classified[i].summary;
      if (!item.description) return '';
      return fallbackSummaries[sIdx++] || item.description;
    });

    const finalResults = top.map((item, i) => ({
      id: item.id,
      title: finalTitles[i],
      rawTitle: item.title,
      rawDescription: item.description || '',
      summary: finalSummaries[i],
      url: item.url,
      source: item.source,
      publishedAt: item.publishedAt,
      impact: classified[i].impact,
      sentiment: classified[i].sentiment,
      tokens: item.tokens.filter(t => allowed.has(t.toUpperCase())),
    }));

    const impactOrder = { high: 0, medium: 1, low: 2 };
    finalResults.sort((a, b) => {
      const imp = impactOrder[a.impact] - impactOrder[b.impact];
      if (imp !== 0) return imp;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return new Response(
      JSON.stringify({ success: true, data: finalResults }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error fetching news:', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

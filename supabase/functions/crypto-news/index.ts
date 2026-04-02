const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function translateTitles(titles: string[], lang: string): Promise<string[]> {
  if (lang === 'en' || titles.length === 0) return titles;
  try {
    return await Promise.all(
      titles.map(async (title) => {
        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(title)}`;
          const resp = await fetch(url);
          if (!resp.ok) return title;
          const data = await resp.json();
          return data?.[0]?.map((s: any) => s[0]).join('') || title;
        } catch { return title; }
      })
    );
  } catch { return titles; }
}

interface RawNewsItem {
  id: string | number;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  tokens: string[];
  votes: { positive: number; negative: number; important: number };
}

function detectTokens(text: string): string[] {
  const upper = text.toUpperCase();
  const found = new Set<string>();
  if (/\bBTC\b/.test(upper) || /\bBITCOIN\b/.test(upper)) found.add('BTC');
  if (/\bETH\b/.test(upper) || /\bETHEREUM\b/.test(upper) || /\bETHER\b/.test(upper)) found.add('ETH');
  if (/\bSOL\b/.test(upper) || /\bSOLANA\b/.test(upper)) found.add('SOL');
  if (/\bHYPE\b/.test(upper) || /\bHYPERLIQUID\b/.test(upper)) found.add('HYPE');
  // Broader crypto terms that often relate to BTC
  if (found.size === 0) {
    if (/\bCRYPTO\b/.test(upper) || /\bDEFI\b/.test(upper) || /\bBLOCKCHAIN\b/.test(upper)) {
      // Don't assign a specific token - leave empty for "All" filter
    }
  }
  return [...found];
}

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

    if (title) {
      items.push({
        id: `${sourceName.toLowerCase().replace(/\s/g, '')}-${count}-${Date.now()}`,
        title: title.trim(),
        url: link.trim(),
        source: sourceName,
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        tokens: detectTokens(title),
        votes: { positive: 0, negative: 0, important: 0 },
      });
      count++;
    }
  }
  return items;
}

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
      console.error(`CryptoPanic failed [${response.status}]`);
      return [];
    }
    if (!response?.ok) return [];

    const data = await response.json();
    return (data.results || []).slice(0, 12).map((item: any) => {
      const sourceName = item.source?.title || item.source?.domain || '';
      const itemUrl = item.original_url || item.url || '';
      let domainSource = sourceName;
      if (!domainSource && itemUrl) {
        try { domainSource = new URL(itemUrl).hostname.replace('www.', ''); } catch {}
      }
      const votes = item.votes || {};
      const tokens = (item.instruments || item.currencies || []).map((c: any) => c.code);
      return {
        id: item.id || Date.now(),
        title: item.title,
        url: itemUrl,
        source: domainSource || 'CryptoPanic',
        publishedAt: item.published_at,
        tokens,
        votes: { positive: votes.positive || 0, negative: votes.negative || 0, important: votes.important || 0 },
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { currencies, kind, lang } = await req.json();
    const coinFilter = currencies || 'BTC,ETH,SOL,HYPE';
    const kindFilter = kind || 'news';
    const targetLang = lang || 'sk';
    const apiKey = Deno.env.get('CRYPTOPANIC_API_KEY');

    // Fetch from all sources in parallel
    const [cpItems, ctItems, cdItems] = await Promise.all([
      apiKey ? fetchCryptoPanic(apiKey, coinFilter, kindFilter) : Promise.resolve([]),
      fetchRssFeed('https://cointelegraph.com/rss', 'CoinTelegraph', 8),
      fetchRssFeed('https://www.coindesk.com/arc/outboundfeeds/rss/', 'CoinDesk', 8),
    ]);

    // Merge and deduplicate by similar title
    const allItems = [...cpItems, ...ctItems, ...cdItems];
    const seen = new Set<string>();
    const unique = allItems.filter(item => {
      const key = item.title.toLowerCase().substring(0, 40);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Sort by date (newest first)
    unique.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());
    const top = unique.slice(0, 25);

    // Translate
    const originalTitles = top.map(item => item.title);
    const translatedTitles = await translateTitles(originalTitles, targetLang);

    // Compute impact & sentiment
    const results = top.map((item, index) => {
      const { votes } = item;
      const totalVotes = votes.positive + votes.negative + votes.important;
      const isImportant = votes.important >= 2;
      let impact: 'high' | 'medium' | 'low' = 'low';
      if (isImportant || totalVotes >= 10) impact = 'high';
      else if (totalVotes >= 3) impact = 'medium';

      let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (votes.positive > votes.negative + 2) sentiment = 'bullish';
      else if (votes.negative > votes.positive + 2) sentiment = 'bearish';

      return {
        id: item.id,
        title: translatedTitles[index] || item.title,
        url: item.url,
        source: item.source,
        publishedAt: item.publishedAt,
        impact,
        sentiment,
        tokens: item.tokens,
        votes,
      };
    });

    // Sort by impact then date
    const impactOrder = { high: 0, medium: 1, low: 2 };
    results.sort((a, b) => {
      const imp = impactOrder[a.impact] - impactOrder[b.impact];
      if (imp !== 0) return imp;
      return new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime();
    });

    return new Response(
      JSON.stringify({ success: true, data: results }),
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

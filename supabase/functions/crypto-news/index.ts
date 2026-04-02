const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function translateTitles(titles: string[], lang: string): Promise<string[]> {
  if (lang === 'en' || titles.length === 0) return titles;

  try {
    // Use Google Translate free endpoint
    const translated = await Promise.all(
      titles.map(async (title) => {
        try {
          const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=${lang}&dt=t&q=${encodeURIComponent(title)}`;
          const resp = await fetch(url);
          if (!resp.ok) return title;
          const data = await resp.json();
          // Response format: [[["translated text","original text",null,null,10]],null,"en"]
          return data?.[0]?.map((s: any) => s[0]).join('') || title;
        } catch {
          return title;
        }
      })
    );
    return translated;
  } catch (e) {
    console.error('Translation error:', e);
    return titles;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('CRYPTOPANIC_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'CRYPTOPANIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { currencies, kind, lang } = await req.json();
    const coinFilter = currencies || 'BTC,ETH,SOL,HYPE';
    const kindFilter = kind || 'news';
    const targetLang = lang || 'sk';

    const url = `https://cryptopanic.com/api/developer/v2/posts/?auth_token=${apiKey}&currencies=${coinFilter}&kind=${kindFilter}&public=true`;

    let response: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      response = await fetch(url);
      if (response.ok) break;
      const body = await response.text();
      if (response.status >= 500 && attempt < 2) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      throw new Error(`CryptoPanic API failed [${response.status}]: ${body.substring(0, 200)}`);
    }
    if (!response || !response.ok) {
      throw new Error('CryptoPanic API unavailable after retries');
    }

    const data = await response.json();
    const items = (data.results || []).slice(0, 20);

    // Translate titles
    const originalTitles = items.map((item: any) => item.title);
    const translatedTitles = await translateTitles(originalTitles, targetLang);

    const results = items.map((item: any, index: number) => {
      const sourceName = item.source?.title || item.source?.domain || '';
      const itemUrl = item.original_url || item.url || '';

      let domainSource = sourceName;
      if (!domainSource && itemUrl) {
        try {
          domainSource = new URL(itemUrl).hostname.replace('www.', '');
        } catch { /* ignore */ }
      }

      const votes = item.votes || {};
      const totalVotes = (votes.positive || 0) + (votes.negative || 0) + (votes.important || 0);
      const isImportant = (votes.important || 0) >= 2;
      let impact: 'high' | 'medium' | 'low' = 'low';
      if (isImportant || totalVotes >= 10) impact = 'high';
      else if (totalVotes >= 3) impact = 'medium';

      const pos = votes.positive || 0;
      const neg = votes.negative || 0;
      let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (pos > neg + 2) sentiment = 'bullish';
      else if (neg > pos + 2) sentiment = 'bearish';

      const tokens = (item.instruments || item.currencies || []).map((c: any) => c.code);

      return {
        id: item.id || index + Date.now(),
        title: translatedTitles[index] || item.title,
        url: itemUrl,
        source: domainSource || 'CryptoPanic',
        publishedAt: item.published_at,
        impact,
        sentiment,
        tokens,
        votes: {
          positive: pos,
          negative: neg,
          important: votes.important || 0,
        },
      };
    });

    const impactOrder = { high: 0, medium: 1, low: 2 };
    results.sort((a: any, b: any) => impactOrder[a.impact as keyof typeof impactOrder] - impactOrder[b.impact as keyof typeof impactOrder]);

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

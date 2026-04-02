const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://connector-gateway.lovable.dev/lovable-ai/v1/chat/completions';

async function translateTitles(titles: string[], lang: string, lovableApiKey: string): Promise<string[]> {
  if (lang === 'en') return titles;

  try {
    const prompt = `Translate these crypto news headlines to Slovak. Return ONLY a JSON array of translated strings, nothing else. Keep crypto terms (BTC, ETH, Bitcoin, etc.) in English. Keep it concise.\n\n${JSON.stringify(titles)}`;

    const response = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash-lite',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      console.error('Translation API failed:', response.status);
      return titles;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';
    // Extract JSON array from response
    const match = content.match(/\[[\s\S]*\]/);
    if (match) {
      const translated = JSON.parse(match[0]);
      if (Array.isArray(translated) && translated.length === titles.length) {
        return translated;
      }
    }
    return titles;
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

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CryptoPanic API failed [${response.status}]: ${errorText.substring(0, 500)}`);
    }

    const data = await response.json();
    const items = (data.results || []).slice(0, 20);

    // Translate titles if not English
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');
    const originalTitles = items.map((item: any) => item.title);
    const translatedTitles = (lovableApiKey && targetLang !== 'en')
      ? await translateTitles(originalTitles, targetLang, lovableApiKey)
      : originalTitles;

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

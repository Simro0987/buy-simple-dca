const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    const { currencies, kind } = await req.json();
    const coinFilter = currencies || 'BTC,ETH,SOL,HYPE';
    const kindFilter = kind || 'news';

    const url = `https://cryptopanic.com/api/developer/v2/posts/?auth_token=${apiKey}&currencies=${coinFilter}&kind=${kindFilter}&public=true`;

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CryptoPanic API failed [${response.status}]: ${errorText.substring(0, 500)}`);
    }

    const data = await response.json();
    const results = (data.results || []).slice(0, 20).map((item: any, index: number) => {
      // Developer plan has limited fields: title, description, published_at, created_at, kind
      // Growth+ plans include: source, url, id, votes, instruments, original_url
      const hasFullData = !!item.source;

      // Extract source name
      const sourceName = item.source?.title || item.source?.domain || '';

      // Extract URL - prefer original_url, fallback to url
      const itemUrl = item.original_url || item.url || '';

      // Extract domain from URL as fallback source
      let domainSource = sourceName;
      if (!domainSource && itemUrl) {
        try {
          domainSource = new URL(itemUrl).hostname.replace('www.', '');
        } catch { /* ignore */ }
      }

      // Votes (only available on Growth+ plans)
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

      // Tokens - instruments on v2, currencies on v1
      const tokens = (item.instruments || item.currencies || []).map((c: any) => c.code);

      return {
        id: item.id || index + Date.now(),
        title: item.title,
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

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

    const { currencies, filter } = await req.json();
    const coinFilter = currencies || 'BTC,ETH,SOL,HYPE';
    const newsFilter = filter || 'news';

    const url = `https://cryptopanic.com/api/v1/posts/?auth_token=${apiKey}&currencies=${coinFilter}&filter=${newsFilter}&public=true`;

    const response = await fetch(url);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`CryptoPanic API failed [${response.status}]: ${errorText}`);
    }

    const data = await response.json();
    const results = (data.results || []).slice(0, 20).map((item: any) => {
      // Determine impact level based on votes and source
      const votes = (item.votes?.positive || 0) + (item.votes?.negative || 0) + (item.votes?.important || 0);
      const isImportant = (item.votes?.important || 0) >= 2;
      let impact: 'high' | 'medium' | 'low' = 'low';
      if (isImportant || votes >= 10) impact = 'high';
      else if (votes >= 3) impact = 'medium';

      // Determine sentiment
      const pos = item.votes?.positive || 0;
      const neg = item.votes?.negative || 0;
      let sentiment: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      if (pos > neg + 2) sentiment = 'bullish';
      else if (neg > pos + 2) sentiment = 'bearish';

      // Extract tokens
      const tokens = (item.currencies || []).map((c: any) => c.code);

      return {
        id: item.id,
        title: item.title,
        url: item.url,
        source: item.source?.title || 'Unknown',
        publishedAt: item.published_at,
        impact,
        sentiment,
        tokens,
        votes: {
          positive: pos,
          negative: neg,
          important: item.votes?.important || 0,
        },
      };
    });

    // Sort: high impact first, then medium, then low
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

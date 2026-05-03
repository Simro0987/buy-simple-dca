// Proxy for CoinGecko API to avoid browser CORS / rate limits
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const cache = new Map<string, { ts: number; body: string; status: number }>();
const TTL_MS = 30_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const path = url.searchParams.get('path');
    if (!path) return new Response(JSON.stringify({ error: 'missing path' }), { status: 400, headers: { ...corsHeaders, 'content-type': 'application/json' } });

    const qs = new URLSearchParams(url.searchParams);
    qs.delete('path');
    const target = `https://api.coingecko.com/api/v3${path}${qs.toString() ? `?${qs.toString()}` : ''}`;

    const cached = cache.get(target);
    const now = Date.now();
    if (cached && now - cached.ts < TTL_MS) {
      return new Response(cached.body, { status: cached.status, headers: { ...corsHeaders, 'content-type': 'application/json', 'x-cache': 'HIT' } });
    }

    const res = await fetch(target, { headers: { accept: 'application/json' } });
    const body = await res.text();
    if (res.ok) cache.set(target, { ts: now, body, status: res.status });
    return new Response(body, { status: res.status, headers: { ...corsHeaders, 'content-type': 'application/json', 'x-cache': 'MISS' } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }
});

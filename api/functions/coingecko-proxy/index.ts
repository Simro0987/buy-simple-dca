// Proxy for CoinGecko API to avoid browser CORS / rate limits
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const cache = new Map<string, { ts: number; body: string; status: number }>();
const TTL_MS = 90_000;            // serve from cache for 90s
let cooldownUntil = 0;            // global 429 cooldown across all endpoints

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

    // Fresh cache hit
    if (cached && now - cached.ts < TTL_MS) {
      return new Response(cached.body, { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json', 'x-cache': 'HIT' } });
    }

    // Global cooldown after a 429: avoid hammering CG, serve stale if we have any
    if (now < cooldownUntil) {
      if (cached) {
        return new Response(cached.body, { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json', 'x-cache': 'COOLDOWN-STALE' } });
      }
      return new Response(JSON.stringify({ error: 'rate_limited', retry_after_ms: cooldownUntil - now }), {
        status: 200, headers: { ...corsHeaders, 'content-type': 'application/json', 'x-cache': 'COOLDOWN-EMPTY' },
      });
    }

    try {
      const res = await fetch(target, { headers: { accept: 'application/json' } });
      const body = await res.text();

      if (res.ok) {
        cache.set(target, { ts: now, body, status: res.status });
        return new Response(body, { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json', 'x-cache': 'MISS' } });
      }

      // Upstream error — set cooldown for 429 then ALWAYS prefer stale
      if (res.status === 429) {
        cooldownUntil = now + 60_000; // 60s global cooldown
      }
      if (cached) {
        return new Response(cached.body, { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json', 'x-cache': 'STALE' } });
      }
      // No cache + upstream error: respond 200 with empty payload to avoid client throws/blank screen
      return new Response('{}', { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json', 'x-cache': 'EMPTY', 'x-upstream-status': String(res.status) } });
    } catch (fetchErr) {
      if (cached) {
        return new Response(cached.body, { status: 200, headers: { ...corsHeaders, 'content-type': 'application/json', 'x-cache': 'STALE' } });
      }
      throw fetchErr;
    }
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, 'content-type': 'application/json' } });
  }
});

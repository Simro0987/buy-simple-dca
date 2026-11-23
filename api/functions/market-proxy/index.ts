// Proxy pre Yahoo Finance (akcie, napr. MSTR) — obchádza CORS v prehliadači.
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const cache = new Map<string, { ts: number; body: string }>();
const TTL_MS = 60_000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, 'content-type': 'application/json' } });

  try {
    const url = new URL(req.url);
    const ticker = (url.searchParams.get('ticker') ?? '').toUpperCase();
    if (!/^[A-Z.\-]{1,10}$/.test(ticker)) return json({ error: 'invalid ticker' }, 400);

    const interval = url.searchParams.get('interval') === '1wk' ? '1wk' : '1d';
    const range = url.searchParams.get('range') === '5y' ? '5y' : '1y';
    const cacheKey = `${ticker}:${interval}:${range}`;
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.ts < TTL_MS) {
      return new Response(hit.body, { headers: { ...corsHeaders, 'content-type': 'application/json', 'x-cache': 'HIT' } });
    }

    const r = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${range}&interval=${interval}`,
      { headers: { 'User-Agent': 'Mozilla/5.0' } },
    );
    if (!r.ok) return json({ error: `yahoo ${r.status}` }, 502);
    const j = await r.json();
    const res = j?.chart?.result?.[0];
    const q = res?.indicators?.quote?.[0] ?? {};
    const rows: Array<{ h: number; l: number; c: number }> = [];
    const closes: number[] = q.close ?? [];
    for (let i = 0; i < closes.length; i++) {
      const c = Number(closes[i]); const h = Number(q.high?.[i]); const l = Number(q.low?.[i]);
      if (c > 0 && h > 0 && l > 0) rows.push({ h, l, c });
    }
    const body = JSON.stringify({
      ticker,
      price: Number(res?.meta?.regularMarketPrice) || rows.at(-1)?.c || 0,
      highs: rows.map((x) => x.h),
      lows: rows.map((x) => x.l),
      closes: rows.map((x) => x.c),
    });
    cache.set(cacheKey, { ts: Date.now(), body });
    return new Response(body, { headers: { ...corsHeaders, 'content-type': 'application/json' } });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

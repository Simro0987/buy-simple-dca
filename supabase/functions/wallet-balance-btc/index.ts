// Bitcoin wallet balance via mempool.space (no API key required)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const cache = new Map<string, { data: unknown; expires: number }>();
const TTL_MS = 60_000;

async function fetchBtcAddress(address: string) {
  const cacheKey = `btc:${address}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const endpoints = [
    `https://mempool.space/api/address/${address}`,
    `https://blockstream.info/api/address/${address}`,
  ];

  let lastErr: unknown = null;
  for (const url of endpoints) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const funded = json.chain_stats?.funded_txo_sum ?? 0;
      const spent = json.chain_stats?.spent_txo_sum ?? 0;
      const mempoolFunded = json.mempool_stats?.funded_txo_sum ?? 0;
      const mempoolSpent = json.mempool_stats?.spent_txo_sum ?? 0;
      const sats = funded - spent + mempoolFunded - mempoolSpent;
      const result = {
        address,
        chain: 'btc',
        balanceSats: sats,
        balanceBtc: sats / 1e8,
        txCount: (json.chain_stats?.tx_count ?? 0) + (json.mempool_stats?.tx_count ?? 0),
        source: url,
      };
      cache.set(cacheKey, { data: result, expires: Date.now() + TTL_MS });
      return result;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('All BTC providers failed');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const { addresses } = await req.json();
    if (!Array.isArray(addresses)) {
      return new Response(JSON.stringify({ error: 'addresses must be an array' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const results = await Promise.allSettled(addresses.map((a: string) => fetchBtcAddress(a)));
    const data = results.map((r, i) => r.status === 'fulfilled'
      ? { ok: true, ...r.value }
      : { ok: false, address: addresses[i], error: String(r.reason) });
    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

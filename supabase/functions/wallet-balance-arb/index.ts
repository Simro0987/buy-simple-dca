// Arbitrum read-only balances via public RPCs
// Returns native ETH on ARB + curated ERC-20 tokens (wstETH, JitoSOL bridged, USDC, USDT, ARB)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RPC_ENDPOINTS = [
  'https://arb1.arbitrum.io/rpc',
  'https://arbitrum.llamarpc.com',
  'https://rpc.ankr.com/arbitrum',
];

const TOKENS: Record<string, { symbol: string; decimals: number; coingeckoId: string }> = {
  '0x5979d7b546e38e414f7e9822514be443a4800529': { symbol: 'wstETH', decimals: 18, coingeckoId: 'wrapped-steth' },
  '0x83e1d2310ade410676b1733d16e89f91822fd5c3': { symbol: 'JitoSOL', decimals: 9, coingeckoId: 'jito-staked-sol' },
  '0xaf88d065e77c8cc2239327c5edb3a432268e5831': { symbol: 'USDC', decimals: 6, coingeckoId: 'usd-coin' },
  '0xfd086bc7cd5c481dcc9c85ebe478a1c0b69fcbb9': { symbol: 'USDT', decimals: 6, coingeckoId: 'tether' },
  '0x912ce59144191c1204e64559fe8253a0e49e6548': { symbol: 'ARB',   decimals: 18, coingeckoId: 'arbitrum' },
};

const cache = new Map<string, { data: unknown; expires: number }>();
const TTL_MS = 60_000;

async function rpcCall(method: string, params: unknown[]): Promise<string> {
  let lastErr: unknown = null;
  for (const url of RPC_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.error) throw new Error(json.error.message);
      return json.result;
    } catch (err) { lastErr = err; }
  }
  throw lastErr ?? new Error('All ARB RPC failed');
}

const balanceOfData = (a: string) => '0x70a08231' + a.toLowerCase().replace('0x', '').padStart(64, '0');

async function fetchArbAddress(address: string) {
  const key = `arb:${address}`;
  const c = cache.get(key);
  if (c && c.expires > Date.now()) return c.data;

  const ethHex = await rpcCall('eth_getBalance', [address, 'latest']);
  const ethBalance = Number(BigInt(ethHex)) / 1e18;

  const entries = Object.entries(TOKENS);
  const results = await Promise.allSettled(
    entries.map(([contract]) => rpcCall('eth_call', [{ to: contract, data: balanceOfData(address) }, 'latest']))
  );
  const tokens = entries.map(([contract, meta], i) => {
    const r = results[i];
    if (r.status !== 'fulfilled' || !r.value || r.value === '0x') return { contract, ...meta, balance: 0 };
    return { contract, ...meta, balance: Number(BigInt(r.value)) / 10 ** meta.decimals };
  }).filter(t => t.balance > 0);

  const result = {
    address,
    chain: 'arb',
    native: { symbol: 'ETH', balance: ethBalance, coingeckoId: 'ethereum' },
    tokens,
  };
  cache.set(key, { data: result, expires: Date.now() + TTL_MS });
  return result;
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
    const results = await Promise.allSettled(addresses.map((a: string) => fetchArbAddress(a)));
    const data = results.map((r, i) => r.status === 'fulfilled'
      ? { ok: true, ...r.value }
      : { ok: false, address: addresses[i], chain: 'arb', error: String(r.reason) });
    return new Response(JSON.stringify({ data }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Ethereum wallet balance via Cloudflare/Ankr RPC (no API key)
// Returns native ETH + a curated list of major ERC-20 tokens (stETH, wstETH, USDC, USDT, WBTC)
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RPC_ENDPOINTS = [
  'https://cloudflare-eth.com',
  'https://rpc.ankr.com/eth',
  'https://eth.llamarpc.com',
];

// Token contract -> {symbol, decimals, coingeckoId}
const TOKENS: Record<string, { symbol: string; decimals: number; coingeckoId: string }> = {
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84': { symbol: 'stETH', decimals: 18, coingeckoId: 'staked-ether' },
  '0x7f39c581f595b53c5cb19bd0b3f8da6c935e2ca0': { symbol: 'wstETH', decimals: 18, coingeckoId: 'wrapped-steth' },
  '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48': { symbol: 'USDC', decimals: 6, coingeckoId: 'usd-coin' },
  '0xdac17f958d2ee523a2206206994597c13d831ec7': { symbol: 'USDT', decimals: 6, coingeckoId: 'tether' },
  '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599': { symbol: 'WBTC', decimals: 8, coingeckoId: 'wrapped-bitcoin' },
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
  throw lastErr ?? new Error('All ETH RPC failed');
}

function hexToBigInt(hex: string): bigint {
  return BigInt(hex);
}

// balanceOf(address) selector = 0x70a08231
function balanceOfData(address: string): string {
  return '0x70a08231' + address.toLowerCase().replace('0x', '').padStart(64, '0');
}

async function fetchEthAddress(address: string) {
  const cacheKey = `eth:${address}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  // Native ETH
  const ethHex = await rpcCall('eth_getBalance', [address, 'latest']);
  const ethWei = hexToBigInt(ethHex);
  const ethBalance = Number(ethWei) / 1e18;

  // ERC-20 tokens in parallel
  const tokenEntries = Object.entries(TOKENS);
  const tokenResults = await Promise.allSettled(
    tokenEntries.map(([contract]) =>
      rpcCall('eth_call', [{ to: contract, data: balanceOfData(address) }, 'latest'])
    )
  );

  const tokens = tokenEntries.map(([contract, meta], i) => {
    const r = tokenResults[i];
    if (r.status !== 'fulfilled' || !r.value || r.value === '0x') {
      return { contract, ...meta, balance: 0 };
    }
    const raw = hexToBigInt(r.value);
    return { contract, ...meta, balance: Number(raw) / 10 ** meta.decimals };
  }).filter(t => t.balance > 0);

  const result = {
    address,
    chain: 'eth',
    native: { symbol: 'ETH', balance: ethBalance, coingeckoId: 'ethereum' },
    tokens,
  };
  cache.set(cacheKey, { data: result, expires: Date.now() + TTL_MS });
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
    const results = await Promise.allSettled(addresses.map((a: string) => fetchEthAddress(a)));
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

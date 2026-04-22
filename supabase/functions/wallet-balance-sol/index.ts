// Solana wallet balance via public mainnet RPC (no API key)
// Returns native SOL + all SPL tokens via getTokenAccountsByOwner
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://rpc.ankr.com/solana',
  'https://solana-rpc.publicnode.com',
];

// Known SPL token mints with metadata
const KNOWN_MINTS: Record<string, { symbol: string; coingeckoId: string }> = {
  'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn': { symbol: 'JitoSOL', coingeckoId: 'jito-staked-sol' },
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': { symbol: 'USDC', coingeckoId: 'usd-coin' },
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': { symbol: 'USDT', coingeckoId: 'tether' },
  'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So': { symbol: 'mSOL', coingeckoId: 'msol' },
  'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1': { symbol: 'bSOL', coingeckoId: 'blazestake-staked-sol' },
};

const cache = new Map<string, { data: unknown; expires: number }>();
const TTL_MS = 60_000;

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
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
  throw lastErr ?? new Error('All SOL RPC failed');
}

async function fetchSolAddress(address: string) {
  const cacheKey = `sol:${address}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.data;

  const [balanceRes, tokenRes] = await Promise.all([
    rpcCall('getBalance', [address]) as Promise<{ value: number }>,
    rpcCall('getTokenAccountsByOwner', [
      address,
      { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
      { encoding: 'jsonParsed' },
    ]) as Promise<{ value: Array<{ account: { data: { parsed: { info: { mint: string; tokenAmount: { uiAmount: number; decimals: number } } } } } }> }>,
  ]);

  const lamports = balanceRes.value ?? 0;
  const solBalance = lamports / 1e9;

  const tokens = (tokenRes.value ?? [])
    .map(acc => {
      const info = acc.account.data.parsed.info;
      const mint = info.mint;
      const amount = info.tokenAmount.uiAmount ?? 0;
      const meta = KNOWN_MINTS[mint];
      return {
        mint,
        symbol: meta?.symbol ?? 'UNKNOWN',
        coingeckoId: meta?.coingeckoId ?? null,
        decimals: info.tokenAmount.decimals,
        balance: amount,
        known: !!meta,
      };
    })
    .filter(t => t.balance > 0);

  const result = {
    address,
    chain: 'sol',
    native: { symbol: 'SOL', balance: solBalance, coingeckoId: 'solana' },
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
    const results = await Promise.allSettled(addresses.map((a: string) => fetchSolAddress(a)));
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

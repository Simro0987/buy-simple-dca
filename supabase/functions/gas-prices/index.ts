// Edge function: aktuálne sieťové poplatky pre BTC, ETH (mainnet), Arbitrum, Solana
// Cache 60s, fallback na konzervatívne defaulty.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TTL_MS = 60_000;
let cache: { ts: number; data: unknown } | null = null;

interface GasData {
  ethPriceUsd: number;
  btcPriceUsd: number;
  solPriceUsd: number;
  // Poplatky v USD pre typické operácie
  fees: {
    btcSend: number;       // BTC L1 transfer (Babylon stake / on-chain)
    ethSwap: number;       // Uniswap/CoW swap na L1 (ETH→stETH)
    ethBridgeArb: number;  // Across/Jumper bridge ETH → ARB
    arbSwap: number;       // Swap na Arbitrum (ETH → rETH)
    arbDeposit: number;    // Beefy/Lombard deposit na ARB
    solSwap: number;       // Jupiter swap na Solane
    solDeposit: number;    // Kamino deposit
  };
  source: 'live' | 'fallback';
}

const FALLBACK: Omit<GasData, 'ethPriceUsd' | 'btcPriceUsd' | 'solPriceUsd'> = {
  fees: {
    btcSend: 2.0,
    ethSwap: 4.5,
    ethBridgeArb: 3.0,
    arbSwap: 0.20,
    arbDeposit: 0.25,
    solSwap: 0.002,
    solDeposit: 0.003,
  },
  source: 'fallback',
};

async function fetchPrices(): Promise<{ eth: number; btc: number; sol: number }> {
  try {
    const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=ethereum,bitcoin,solana&vs_currencies=usd');
    const j = await r.json();
    return {
      eth: j.ethereum?.usd ?? 3500,
      btc: j.bitcoin?.usd ?? 95000,
      sol: j.solana?.usd ?? 200,
    };
  } catch {
    return { eth: 3500, btc: 95000, sol: 200 };
  }
}

async function fetchEthGasGwei(apiKey: string | null): Promise<number | null> {
  if (!apiKey) return null;
  try {
    const r = await fetch(`https://api.etherscan.io/api?module=gastracker&action=gasoracle&apikey=${apiKey}`);
    const j = await r.json();
    const fast = parseFloat(j?.result?.FastGasPrice ?? '');
    return Number.isFinite(fast) ? fast : null;
  } catch {
    return null;
  }
}

async function fetchBtcSatPerVB(): Promise<number | null> {
  try {
    const r = await fetch('https://mempool.space/api/v1/fees/recommended');
    const j = await r.json();
    return j?.halfHourFee ?? j?.hourFee ?? null;
  } catch {
    return null;
  }
}

async function build(): Promise<GasData> {
  const apiKey = Deno.env.get('ETHERSCAN_API_KEY') ?? null;
  const [prices, gweiFast, satVb] = await Promise.all([
    fetchPrices(),
    fetchEthGasGwei(apiKey),
    fetchBtcSatPerVB(),
  ]);

  // ETH L1 swap ~ 180k gas, bridge ~ 120k gas
  let ethSwap = FALLBACK.fees.ethSwap;
  let ethBridgeArb = FALLBACK.fees.ethBridgeArb;
  if (gweiFast != null) {
    ethSwap = (gweiFast * 1e-9) * 180_000 * prices.eth;
    ethBridgeArb = (gweiFast * 1e-9) * 120_000 * prices.eth;
  }

  // BTC: typický transfer ~ 140 vB
  let btcSend = FALLBACK.fees.btcSend;
  if (satVb != null) {
    btcSend = (satVb * 140) * 1e-8 * prices.btc;
  }

  return {
    ethPriceUsd: prices.eth,
    btcPriceUsd: prices.btc,
    solPriceUsd: prices.sol,
    fees: {
      btcSend: Math.max(0.5, btcSend),
      ethSwap: Math.max(1, ethSwap),
      ethBridgeArb: Math.max(0.5, ethBridgeArb),
      arbSwap: FALLBACK.fees.arbSwap,
      arbDeposit: FALLBACK.fees.arbDeposit,
      solSwap: FALLBACK.fees.solSwap,
      solDeposit: FALLBACK.fees.solDeposit,
    },
    source: gweiFast != null || satVb != null ? 'live' : 'fallback',
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const now = Date.now();
    if (!cache || now - cache.ts > TTL_MS) {
      cache = { ts: now, data: await build() };
    }
    return new Response(JSON.stringify(cache.data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

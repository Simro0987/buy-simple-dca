import { oracleValue, type OracleMetric } from './oracleRegistry';
// Never-Fail API Manager.
// Cascading price fetcher: Binance → CoinGecko → hard fallback (Mobula len na serveri).
// Every fetch is wrapped in a 3s timeout and try/catch. Never throws.

const TIMEOUT_MS = 3000;


const HARD_FALLBACK: Record<string, number> = {
  ETH: 3000,
  SOL: 150,
  BTC: 95000,
  LINK: 15,
};

const MOBULA_ADDR: Record<string, { chainId: string; address: string }> = {
  ETH:  { chainId: 'evm:1', address: '0x0000000000000000000000000000000000000000' }, // placeholder; use symbol path below
};

const BINANCE_SYMBOL: Record<string, string> = {
  ETH: 'ETHUSDT',
  BTC: 'BTCUSDT',
  SOL: 'SOLUSDT',
  LINK: 'LINKUSDT',
  AAVE: 'AAVEUSDT',
  UNI: 'UNIUSDT',
  NEAR: 'NEARUSDT',
  PENDLE: 'PENDLEUSDT',
  HYPE: 'HYPEUSDT',
  PAXG: 'PAXGUSDT',
  WBTC: 'WBTCUSDT',
};

export const COINGECKO_ID: Record<string, string> = {
  ETH: 'ethereum',
  BTC: 'bitcoin',
  SOL: 'solana',
  LINK: 'chainlink',
  HYPE: 'hyperliquid',
  
  AAVE: 'aave',
  UNI: 'uniswap',
  NEAR: 'near',
  XMR: 'monero',
  PENDLE: 'pendle',
  TAO: 'bittensor',
  INJ: 'injective-protocol',
  ENA: 'ethena',
  PUMP: 'pump-fun',
  HNT: 'helium',
  MSTR: 'microstrategy-xstock',
  WBTC: 'wrapped-bitcoin',
  PAXG: 'pax-gold',
  USDC: 'usd-coin',
  USDT: 'tether',
};

function withTimeout<T>(p: Promise<T>, ms = TIMEOUT_MS): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

async function safeJson(url: string, init?: RequestInit): Promise<unknown | null> {
  try {
    const r = await withTimeout(fetch(url, init));
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

async function fromBinance(symbol: string): Promise<number | null> {
  const s = BINANCE_SYMBOL[symbol];
  if (!s) return null;
  const j = await safeJson(`https://api.binance.com/api/v3/ticker/price?symbol=${s}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const price = parseFloat((j as any)?.price ?? '');
  return Number.isFinite(price) && price > 0 ? price : null;
}

async function fromCoinGecko(symbol: string): Promise<number | null> {
  const id = COINGECKO_ID[symbol];
  if (!id) return null;
  const j = await safeJson(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=usd`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const price = (j as any)?.[id]?.usd;
  return typeof price === 'number' && price > 0 ? price : null;
}

async function fromCoinGeckoProxy(symbol: string): Promise<number | null> {
  const id = COINGECKO_ID[symbol];
  if (!id) return null;
  const base = import.meta.env.VITE_SUPABASE_URL;
  if (!base) return null;
  const j = await safeJson(`${base}/functions/v1/coingecko-proxy?path=${encodeURIComponent('/simple/price')}&ids=${id}&vs_currencies=usd`,
    { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '' } });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const price = (j as any)?.[id]?.usd;
  return typeof price === 'number' && price > 0 ? price : null;
}

async function fromDefiLlama(symbol: string): Promise<number | null> {
  const id = COINGECKO_ID[symbol];
  if (!id) return null;
  const j = await safeJson(`https://coins.llama.fi/prices/current/coingecko:${id}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const price = (j as any)?.coins?.[`coingecko:${id}`]?.price;
  return typeof price === 'number' && price > 0 ? price : null;
}

const ORACLE_METRIC: Record<string, OracleMetric> = { BTC: 'btcUsd', ETH: 'ethUsd', SOL: 'solUsd' };
/** BTC/ETH/SOL always come from the shared averaged oracle so every screen matches. */
async function fromOracle(symbol: string): Promise<number | null> {
  const m = ORACLE_METRIC[symbol.toUpperCase()];
  return m ? oracleValue(m) : null;
}

/** Last good price per symbol — served before the static hard fallback. */
const lastGood: Record<string, number> = {};

/**
 * Cascade: Binance → CoinGecko → CoinGecko (backend proxy) → DefiLlama → last good → hard fallback.
 * Never throws; always resolves to a positive number.
 */
export async function fetchTokenPrice(symbol: string): Promise<number> {
  const sources = [fromOracle, fromBinance, fromCoinGecko, fromCoinGeckoProxy, fromDefiLlama];
  for (const src of sources) {
    try {
      const p = await src(symbol);
      if (p && p > 0) { lastGood[symbol] = p; return p; }
    } catch { /* try next */ }
  }
  return lastGood[symbol] ?? HARD_FALLBACK[symbol] ?? 0;
}

/** Never-fail wrapper for arbitrary JSON fetches with fallback value. */
export async function safeFetchJson<T>(url: string, fallback: T, init?: RequestInit): Promise<T> {
  try {
    const r = await withTimeout(fetch(url, init));
    if (!r.ok) return fallback;
    return (await r.json()) as T;
  } catch {
    return fallback;
  }
}

export { withTimeout, TIMEOUT_MS };

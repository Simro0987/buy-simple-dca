/**
 * Universal Oracle Registry — every external metric maps to an array of vetted
 * public endpoints; `fetchAndAverage` queries them concurrently and averages
 * only valid, positive results. All-fail → last cached value → safe baseline.
 */
import { fetchCentralHub, invalidateCentralHub } from './centralApiHub';

export type OracleSource = { name: string; fetch: (signal: AbortSignal) => Promise<number> };

const TIMEOUT_MS = 8000;

async function getJson(url: string, signal: AbortSignal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

/** Run all sources via Promise.allSettled, drop failures/timeouts/NaN/≤0, return mean. */
export async function fetchAndAverage(sources: OracleSource[], timeoutMs = TIMEOUT_MS) {
  const settled = await Promise.allSettled(sources.map(async (s) => {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeoutMs);
    try { return await s.fetch(ctl.signal); } finally { clearTimeout(t); }
  }));
  const ok: { name: string; value: number }[] = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled' && Number.isFinite(r.value) && r.value > 0) ok.push({ name: sources[i].name, value: r.value });
  });
  const value = ok.length ? ok.reduce((a, s) => a + s.value, 0) / ok.length : null;
  return { value, used: ok.map((s) => s.name), failed: sources.length - ok.length };
}

const cg = (id: string, vs: 'usd' | 'eur'): OracleSource => ({
  name: 'CoinGecko',
  fetch: async (sig) => Number((await getJson(`https://api.coingecko.com/api/v3/simple/price?ids=${id}&vs_currencies=${vs}`, sig))?.[id]?.[vs]),
});
const bn = (pair: string): OracleSource => ({
  name: 'Binance',
  fetch: async (sig) => Number((await getJson(`https://api.binance.com/api/v3/ticker/price?symbol=${pair}`, sig))?.price),
});
const cb = (pair: string): OracleSource => ({
  name: 'Coinbase',
  fetch: async (sig) => Number((await getJson(`https://api.coinbase.com/v2/prices/${pair}/spot`, sig))?.data?.amount),
});

export type OracleMetric = 'fearGreed' | 'btcUsd' | 'btcEur' | 'ethUsd' | 'ethEur' | 'solUsd' | 'eurUsd';

/** Central indicator config — the only place external data endpoints are mapped. */
export const ORACLE_REGISTRY: Record<OracleMetric, { baseline: number; primary?: OracleSource; sources: OracleSource[] }> = {
  fearGreed: {
    baseline: 40,
    sources: [
      // Jediný zdroj: On-Chain Motor v Centrálnom API Uzle (CoinStats aj alternative.me sú vyradené).
      { name: 'On-Chain Motor', fetch: async () => Number((await fetchCentralHub()).fearGreed?.value) },
    ],
  },
  btcUsd: { baseline: 0, primary: { name: 'Central API Hub', fetch: async () => Number((await fetchCentralHub()).price?.value) }, sources: [cg('bitcoin', 'usd'), bn('BTCUSDT'), cb('BTC-USD')] },
  btcEur: { baseline: 0, sources: [cg('bitcoin', 'eur'), bn('BTCEUR'), cb('BTC-EUR')] },
  ethUsd: { baseline: 0, sources: [cg('ethereum', 'usd'), bn('ETHUSDT'), cb('ETH-USD')] },
  ethEur: { baseline: 0, sources: [cg('ethereum', 'eur'), bn('ETHEUR'), cb('ETH-EUR')] },
  solUsd: { baseline: 0, sources: [cg('solana', 'usd'), bn('SOLUSDT'), cb('SOL-USD')] },
  eurUsd: {
    baseline: 0,
    sources: [
      bn('EURUSDT'),
      cb('EUR-USD'),
      { name: 'CoinGecko', fetch: async (sig) => 1 / Number((await getJson('https://api.coingecko.com/api/v3/simple/price?ids=tether&vs_currencies=eur', sig))?.tether?.eur) },
    ],
  },
};

const CACHE_KEY = 'oracle-registry-cache-v1';
function readCache(): Partial<Record<OracleMetric, number>> {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) ?? '{}'); } catch { return {}; }
}

export type OracleReading = { value: number | null; source: 'live' | 'cache' | 'baseline'; used: string[] };

/** Resolve one metric: live average → last known cached value → safe baseline (null if baseline 0). */
const MEMO_MS = 60_000;
const memo = new Map<OracleMetric, { at: number; p: Promise<OracleReading> }>();

/** Shared app-wide reading: concurrent/recent callers get the identical averaged value. */
export function readOracle(metric: OracleMetric): Promise<OracleReading> {
  const hit = memo.get(metric);
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.p;
  const p = readOracleUncached(metric).catch((e) => { memo.delete(metric); throw e; });
  memo.set(metric, { at: Date.now(), p });
  return p;
}

/** Force the next readOracle call to refetch (used by the global refresh). */
export function invalidateOracles() { memo.clear(); invalidateCentralHub(); }

/** Averaged numeric value or null. */
export async function oracleValue(metric: OracleMetric): Promise<number | null> {
  return (await readOracle(metric)).value;
}

/** Averaged F&G (live → cache → baseline 40) with standard classification label. */
export async function readFearGreed(): Promise<{ value: number; classification: string }> {
  const v = Math.round((await readOracle('fearGreed')).value ?? ORACLE_REGISTRY.fearGreed.baseline);
  const classification = v <= 24 ? 'Extreme Fear' : v <= 44 ? 'Fear' : v <= 55 ? 'Neutral' : v <= 75 ? 'Greed' : 'Extreme Greed';
  return { value: v, classification };
}

async function readOracleUncached(metric: OracleMetric): Promise<OracleReading> {
  const cfg = ORACLE_REGISTRY[metric];
  // Central hub first so every screen shows the identical value; averaged sources only if it fails.
  const prim = cfg.primary ? await fetchAndAverage([cfg.primary]) : null;
  const res = prim?.value != null ? prim : await fetchAndAverage(cfg.sources);
  const cache = readCache();
  if (res.value != null) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify({ ...cache, [metric]: res.value })); } catch { /* ignore */ }
    return { value: res.value, source: 'live', used: res.used };
  }
  if (cache[metric] != null && cache[metric]! > 0) return { value: cache[metric]!, source: 'cache', used: [] };
  return { value: cfg.baseline > 0 ? cfg.baseline : null, source: 'baseline', used: [] };
}

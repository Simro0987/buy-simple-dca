/**
 * TTL cache for the 100 % free data architecture.
 *
 * Every external call goes through `cached()` so free-tier rate limits are
 * never exceeded: DefiLlama is cached for hours, Binance daily/weekly candles
 * for half a day, CoinGecko for an hour. On a failed refresh the last stored
 * value is served (stale-if-error), so the UI never goes blank.
 */

export const TTL = {
  /** DefiLlama TVL / fees / yields — slow moving. */
  llama: 4 * 60 * 60_000,
  /** Binance daily & weekly candles. */
  binanceCandles: 12 * 60 * 60_000,
  /** Binance derivatives (funding, open interest). */
  binanceDerivs: 30 * 60_000,
  /** CoinGecko market data. */
  coingecko: 60 * 60_000,
  /** Coinglass / public on-chain proxies. */
  onchain: 60 * 60_000,
} as const;

import { getCacheEpoch } from '@/lib/dataSync';

const PREFIX = 'free-cache-v1:';

interface Entry<T> { data: T; savedAt: number }

const memory = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function read<T>(key: string): Entry<T> | null {
  const mem = memory.get(key) as Entry<T> | undefined;
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Entry<T>;
    memory.set(key, parsed);
    return parsed;
  } catch { return null; }
}

function write<T>(key: string, data: T) {
  const entry: Entry<T> = { data, savedAt: Date.now() };
  memory.set(key, entry);
  try { localStorage.setItem(PREFIX + key, JSON.stringify(entry)); } catch { /* quota */ }
}

/**
 * Returns the cached value when fresh, otherwise fetches once (deduplicated).
 * A failed fetch falls back to the stale value, then to `null`.
 */
export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T | null>): Promise<T | null> {
  const hit = read<T>(key);
  if (hit && hit.savedAt >= getCacheEpoch() && Date.now() - hit.savedAt < ttlMs) return hit.data;

  const running = inflight.get(key) as Promise<T | null> | undefined;
  if (running) return running;

  const p = (async () => {
    try {
      const fresh = await fetcher();
      if (fresh != null) { write(key, fresh); return fresh; }
    } catch { /* fall through to stale */ }
    return hit ? hit.data : null;
  })().finally(() => inflight.delete(key));

  inflight.set(key, p);
  return p;
}

/** fetch + timeout + JSON, never throws. */
export async function safeJson<T>(url: string, ms = 9000): Promise<T | null> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json() as T;
  } catch { return null; }
}

export function clearFreeCache(): void {
  memory.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

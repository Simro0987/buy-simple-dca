// Browser helpers for the server-side read-only data proxy (api/functions/data-proxy).
// Keys (Helius/SOLANA_RPC_URL, COINGLASS_API_KEY) stay on the server; the browser never calls
// those providers directly.
import { apiBaseUrl } from './client';

export const dataProxyUrl = (query: string) => `${apiBaseUrl()}/functions/v1/data-proxy?${query}`;

/** Solana JSON-RPC (allow-listed read methods only). Returns `result` or null. */
export async function solanaRpc<T = unknown>(method: string, params: unknown[] = [], timeoutMs = 6000): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(dataProxyUrl('src=solana'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    return (json?.result ?? null) as T | null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** GET JSON from the proxy (pyth | funding | coinglass). Returns null on any failure. */
export async function dataProxyGet<T = unknown>(query: string, timeoutMs = 8000): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(dataProxyUrl(query), { signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

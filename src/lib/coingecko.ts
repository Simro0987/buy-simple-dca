import { apiBaseUrl } from '@/lib/api/client';

const PROXY_BASE = `${apiBaseUrl()}/functions/v1/coingecko-proxy`;

/**
 * Fetch from CoinGecko via the own API proxy (avoids CORS / rate limits).
 * Falls back to direct call if proxy fails.
 * @param path Path after /api/v3, e.g. "/simple/price"
 * @param params Query params
 */
export async function cgFetch(path: string, params: Record<string, string | number | boolean> = {}): Promise<Response> {
  const qs = new URLSearchParams({ path });
  for (const [k, v] of Object.entries(params)) qs.append(k, String(v));
  const proxyUrl = `${PROXY_BASE}?${qs.toString()}`;

  try {
    const res = await fetch(proxyUrl);
    if (res.ok) return res;
  } catch {
    // network error → fallback
  }
  // Fallback: direct
  const direct = `https://api.coingecko.com/api/v3${path}?${new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
  ).toString()}`;
  return fetch(direct);
}

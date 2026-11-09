import { useQuery } from '@tanstack/react-query';

const TIMEOUT_MS = 2500;

const ENDPOINTS: Array<{ name: 'solana' | 'base' | 'arbitrum'; url: string; body: unknown }> = [
  {
    name: 'solana',
    url: 'https://api.mainnet-beta.solana.com',
    body: { jsonrpc: '2.0', id: 1, method: 'getHealth' },
  },
  {
    name: 'base',
    url: 'https://mainnet.base.org',
    body: { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
  },
  {
    name: 'arbitrum',
    url: 'https://arb1.arbitrum.io/rpc',
    body: { jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] },
  },
];

export type RpcHealthStatus = 'ok' | 'degraded' | 'down' | 'unknown';

export interface RpcHealthResult {
  status: RpcHealthStatus;
  latencyMs: number | null;
  endpoints: Array<{ name: string; ok: boolean; latencyMs: number | null }>;
  checkedAt: number;
}

async function pingOne(url: string, body: unknown): Promise<{ ok: boolean; latencyMs: number | null }> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  const start = performance.now();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    const latencyMs = Math.round(performance.now() - start);
    return { ok: res.ok, latencyMs };
  } catch {
    return { ok: false, latencyMs: null };
  } finally {
    clearTimeout(t);
  }
}

export function useRpcHealth() {
  return useQuery<RpcHealthResult>({
    queryKey: ['rpc-health'],
    queryFn: async () => {
      const results = await Promise.all(
        ENDPOINTS.map(async e => ({ name: e.name, ...(await pingOne(e.url, e.body)) })),
      );
      const okCount = results.filter(r => r.ok).length;
      const latencies = results.map(r => r.latencyMs ?? TIMEOUT_MS);
      const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
      let status: RpcHealthStatus = 'unknown';
      if (okCount === results.length) status = 'ok';
      else if (okCount === 0) status = 'down';
      else status = 'degraded';
      return { status, latencyMs: avg, endpoints: results, checkedAt: Date.now() };
    },
    refetchInterval: 45_000,
    staleTime: 30_000,
    retry: 1,
  });
}

import { createServer, type Server } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

/**
 * Read-only HTTP API. Only GET /healthz and GET /status exist; every other method or path is
 * rejected. There is NO endpoint that can trigger, change or cancel a trade.
 */
export function createStatusServer(getStatus: () => unknown, opts: { token?: string } = {}): Server {
  const tokenBuf = opts.token ? Buffer.from(opts.token) : null;
  return createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    const send = (code: number, body: unknown) => {
      res.writeHead(code, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
      });
      res.end(JSON.stringify(body, (_k, v) => (typeof v === 'bigint' ? v.toString() : v)));
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'read-only API' });
    if (url === '/healthz') return send(200, { ok: true });
    if (url !== '/status') return send(404, { error: 'not found' });
    if (tokenBuf) {
      const got = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
      if (got.length !== tokenBuf.length || !timingSafeEqual(got, tokenBuf)) return send(401, { error: 'unauthorized' });
    }
    try {
      return send(200, getStatus());
    } catch {
      return send(500, { error: 'status unavailable' });
    }
  });
}

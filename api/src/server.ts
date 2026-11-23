/**
 * HTTP gateway used by the own client (shared/apiClient.ts):
 *   /auth/v1/*      Sign-In with Ethereum sessions (GoTrue-shaped)
 *   /rest/v1/*      proxied to the local PostgREST (RLS enforced by Postgres itself)
 *   /functions/v1/* the ported edge functions
 * Mounted by nginx at /api/ (the /api prefix, and the legacy /sb prefix, are stripped here too).
 */
import { timingSafeEqual } from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import { AuthError, type SiweAuth } from './auth';
import { verifyJwt } from './jwt';
import { RateLimiter } from './rateLimit';

export interface GatewayDeps {
  auth: SiweAuth;
  jwtSecret: string;
  edgeSecret: string;
  postgrest: { host: string; port: number };
  allowedOrigins: string[];
  health: () => Promise<{ ok: boolean; [k: string]: unknown }>;
  invoke: (name: string, req: Request) => Promise<Response>;
  isPublicFunction: (name: string) => boolean;
  log?: (msg: string, data?: Record<string, unknown>) => void;
}

const MAX_BODY = 1024 * 1024;
const ALLOW_HEADERS =
  'authorization, x-client-info, apikey, content-type, prefer, accept, accept-profile, content-profile, range, range-unit, x-supabase-api-version, x-retry-count';
const EXPOSE_HEADERS = 'content-range, content-location, preference-applied, location, x-total-count';
const HOP = new Set(['connection', 'keep-alive', 'transfer-encoding', 'upgrade', 'proxy-connection', 'te', 'trailer', 'content-length', 'content-encoding']);

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function clientIp(req: IncomingMessage): string {
  const real = req.headers['x-real-ip'];
  if (typeof real === 'string' && real) return real;
  return req.socket.remoteAddress ?? 'unknown';
}

function readBody(req: IncomingMessage, limit = MAX_BODY): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > limit) {
        reject(new AuthError(413, 'payload_too_large', 'request body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function bearer(req: IncomingMessage): string | null {
  const h = req.headers.authorization;
  if (!h || !/^bearer\s+/i.test(h)) return null;
  return h.replace(/^bearer\s+/i, '').trim();
}

export function createGateway(d: GatewayDeps): http.Server {
  const authLimiter = new RateLimiter(30, 60_000);
  const log = d.log ?? (() => {});

  const cors = (req: IncomingMessage, res: ServerResponse) => {
    const origin = req.headers.origin;
    if (!origin) return;
    let sameHost = false;
    try {
      sameHost = new URL(origin).host === (req.headers['x-forwarded-host'] ?? req.headers.host);
    } catch {
      /* ignore */
    }
    if (sameHost || d.allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', ALLOW_HEADERS);
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PATCH, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Expose-Headers', EXPOSE_HEADERS);
      res.setHeader('Access-Control-Max-Age', '600');
    }
  };

  const sendJson = (res: ServerResponse, status: number, body: unknown) => {
    if (status === 204) {
      res.writeHead(204).end();
      return;
    }
    const s = JSON.stringify(body);
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(s);
  };
  const authErr = (res: ServerResponse, e: AuthError) =>
    sendJson(res, e.status, { code: e.status, error_code: e.code, msg: e.message, error: e.code, error_description: e.message });

  async function handleAuth(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams) {
    const method = req.method ?? 'GET';
    if (path === '/health' || path === '/settings') {
      return sendJson(res, 200, { name: 'buy-simple-dca-siwe', external: { siwe: true, email: false }, disable_signup: false });
    }
    if (path.startsWith('/siwe/') || path === '/token') {
      if (!authLimiter.allow(clientIp(req))) return authErr(res, new AuthError(429, 'over_request_rate_limit', 'too many requests'));
    }
    if (path === '/siwe/nonce' && method === 'GET') return sendJson(res, 200, { nonce: await d.auth.createNonce() });
    if (path === '/siwe/verify' && method === 'POST') {
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      const host = String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim();
      return sendJson(res, 200, await d.auth.verify(body.message, body.signature, host));
    }
    if (path === '/token' && method === 'POST') {
      const grant = query.get('grant_type');
      const body = JSON.parse((await readBody(req)).toString('utf8') || '{}');
      if (grant === 'refresh_token') return sendJson(res, 200, await d.auth.refresh(body.refresh_token));
      throw new AuthError(400, 'unsupported_grant_type', 'Use Sign-In with Ethereum (wallet) - email/password login is disabled');
    }
    if (path === '/signup' || path === '/otp' || path === '/recover' || path === '/magiclink') {
      throw new AuthError(400, 'signup_disabled', 'Use Sign-In with Ethereum (wallet) - email signups are disabled');
    }
    const token = bearer(req);
    if (path === '/user' && method === 'GET') {
      if (!token) throw new AuthError(401, 'no_authorization', 'missing bearer token');
      return sendJson(res, 200, await d.auth.currentUser(token));
    }
    if (path === '/logout' && method === 'POST') {
      const c = token ? d.auth.verifyAccessToken(token) : null;
      if (!c) throw new AuthError(401, 'bad_jwt', 'invalid JWT');
      if ((query.get('scope') ?? 'global') === 'global') await d.auth.revokeAllForUser(c.sub as string);
      else await d.auth.revokeSession(c.session_id as string);
      return sendJson(res, 204, null);
    }
    throw new AuthError(404, 'not_found', 'auth endpoint not found');
  }

  function proxyRest(req: IncomingMessage, res: ServerResponse, pathAndQuery: string) {
    const headers: Record<string, string | string[]> = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined || HOP.has(k) || k === 'host' || k === 'apikey' || k === 'authorization' || k === 'cookie') continue;
      headers[k] = v;
    }
    const token = bearer(req);
    // Only tokens signed by this API reach PostgREST; anything else (e.g. the public
    // "publishable key") is dropped so the request runs as `anon`.
    if (token && verifyJwt(token, d.jwtSecret)) headers.authorization = `Bearer ${token}`;
    const len = Number(req.headers['content-length'] ?? 0);
    if (len > 2 * MAX_BODY) return sendJson(res, 413, { message: 'payload too large' });
    const up = http.request(
      { host: d.postgrest.host, port: d.postgrest.port, method: req.method, path: pathAndQuery, headers },
      (pr) => {
        const out: Record<string, string | string[]> = {};
        for (const [k, v] of Object.entries(pr.headers)) if (v !== undefined && !HOP.has(k) && !k.startsWith('access-control-')) out[k] = v;
        res.writeHead(pr.statusCode ?? 502, out);
        pr.pipe(res);
      },
    );
    up.setTimeout(30_000, () => up.destroy(new Error('postgrest timeout')));
    up.on('error', (e) => {
      log('postgrest proxy error', { error: e.message });
      if (!res.headersSent) sendJson(res, 502, { message: 'database API unavailable' });
      else res.destroy();
    });
    req.pipe(up);
  }

  async function handleFunction(req: IncomingMessage, res: ServerResponse, name: string, rest: string, search: string) {
    if (!/^[a-z0-9-]{1,64}$/.test(name)) return sendJson(res, 404, { error: 'not found' });
    // Like Supabase verify_jwt: protected functions need a JWT signed by us (a user session,
    // or the service key that functions use to call each other) or the internal edge secret
    // (scheduler). Unlike Supabase, the anon key is NOT enough.
    const edge = req.headers['x-edge-secret'];
    const internal = d.edgeSecret.length > 0 && typeof edge === 'string' && safeEqual(edge, d.edgeSecret);
    if (!internal && !d.isPublicFunction(name)) {
      const token = bearer(req);
      const claims = token ? verifyJwt(token, d.jwtSecret) : null;
      const ok = claims && (claims.role === 'service_role' || (claims.role === 'authenticated' && d.auth.verifyAccessToken(token!)));
      if (!ok) return sendJson(res, 401, { code: 401, message: 'Invalid JWT' });
    }
    const method = req.method ?? 'GET';
    const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined || HOP.has(k) || k === 'host' || k === 'cookie') continue;
      headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    }
    const request = new Request(`http://functions.internal/functions/v1/${name}${rest}${search}`, {
      method,
      headers,
      body: body && body.length ? new Uint8Array(body) : undefined,
    });
    const response = await d.invoke(name, request);
    const out: Record<string, string> = {};
    response.headers.forEach((v, k) => {
      if (!HOP.has(k) && !k.startsWith('access-control-')) out[k] = v;
    });
    const buf = Buffer.from(await response.arrayBuffer());
    res.writeHead(response.status, out).end(buf);
  }

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://x');
      let path = url.pathname;
      if (path === '/api' || path.startsWith('/api/')) path = path.slice(4) || '/';
      else if (path === '/sb' || path.startsWith('/sb/')) path = path.slice(3) || '/';
      cors(req, res);
      if (req.method === 'OPTIONS') return void res.writeHead(204).end();
      if (path === '/healthz') {
        const h = await d.health();
        return sendJson(res, h.ok ? 200 : 503, h);
      }
      if (path.startsWith('/auth/v1/')) return await handleAuth(req, res, path.slice('/auth/v1'.length), url.searchParams);
      if (path === '/rest/v1' || path.startsWith('/rest/v1/')) {
        // Root = health ping used by the UI (OpenAPI output of PostgREST is disabled).
        if ((req.method === 'HEAD' || req.method === 'GET') && (path === '/rest/v1' || path === '/rest/v1/')) {
          return void res.writeHead(200, { 'Content-Type': 'application/json' }).end(req.method === 'GET' ? '{}' : undefined);
        }
        return proxyRest(req, res, (path.slice('/rest/v1'.length) || '/') + url.search);
      }
      const fm = /^\/functions\/v1\/([^/]+)(\/.*)?$/.exec(path);
      if (fm) return await handleFunction(req, res, fm[1], fm[2] ?? '', url.search);
      sendJson(res, 404, { message: 'not found' });
    } catch (e) {
      if (e instanceof AuthError) return authErr(res, e);
      if (e instanceof SyntaxError) return authErr(res, new AuthError(400, 'bad_json', 'invalid JSON body'));
      log('gateway error', { error: (e as Error).message });
      if (!res.headersSent) sendJson(res, 500, { message: 'internal error' });
    }
  });
}

import { createHmac, timingSafeEqual } from 'node:crypto';

/** Minimal HS256 JWT (same algorithm/secret PostgREST verifies). */
export type Claims = Record<string, unknown> & { sub?: string; role?: string; exp?: number; iat?: number };

const b64u = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signJwt(claims: Claims, secret: string): string {
  const header = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64u(JSON.stringify(claims));
  const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${sig}`;
}

/** Returns the claims if the signature is valid and the token is not expired, else null. */
export function verifyJwt(token: string, secret: string, nowSec = Math.floor(Date.now() / 1000)): Claims | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  try {
    const header = JSON.parse(Buffer.from(h, 'base64url').toString('utf8'));
    if (header.alg !== 'HS256') return null;
    const expected = createHmac('sha256', secret).update(`${h}.${p}`).digest();
    const got = Buffer.from(s, 'base64url');
    if (got.length !== expected.length || !timingSafeEqual(got, expected)) return null;
    const claims = JSON.parse(Buffer.from(p, 'base64url').toString('utf8')) as Claims;
    if (typeof claims.exp === 'number' && claims.exp <= nowSec) return null;
    return claims;
  } catch {
    return null;
  }
}

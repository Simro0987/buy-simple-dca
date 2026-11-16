/**
 * Sign-In with Ethereum (EIP-4361) replacing Supabase Auth.
 * - EOA wallets: signature recovered locally.
 * - Smart accounts / Safe{Wallet}: EIP-1271 `isValidSignature(bytes32,bytes)` on the account's chain.
 * Sessions are GoTrue-shaped ({ access_token, refresh_token, user, ... }) so the existing
 * supabase-js client in the web app keeps working via `supabase.auth.setSession()`.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { getAddress, hashMessage, isAddress, recoverMessageAddress, type Address, type Hex } from 'viem';
import { generateSiweNonce, parseSiweMessage } from 'viem/siwe';
import { signJwt, verifyJwt, type Claims } from './jwt';

export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>;
}

export type Erc1271Check = (chainId: number, account: Address, hash: Hex, signature: Hex) => Promise<boolean>;

export interface AuthDeps {
  db: Queryable;
  jwtSecret: string;
  accessTtlSec: number;
  refreshTtlSec: number;
  siweDomains: string[];
  erc1271: Erc1271Check;
  now?: () => number; // ms
}

export class AuthError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

interface UserRow {
  id: string;
  wallet_address: string;
  created_at: Date | string;
  last_sign_in_at: Date | string | null;
  raw_user_meta_data: Record<string, unknown> | null;
}

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
const NONCE_TTL_SEC = 1800; // Safe multisig owners may need a while to co-sign
const MAX_MESSAGE_AGE_SEC = 1800;

export function toGoTrueUser(u: UserRow, chainId?: number) {
  return {
    id: u.id,
    aud: 'authenticated',
    role: 'authenticated',
    email: '',
    phone: '',
    app_metadata: { provider: 'siwe', providers: ['siwe'] },
    user_metadata: { ...(u.raw_user_meta_data ?? {}), wallet_address: getAddress(u.wallet_address), ...(chainId ? { chain_id: chainId } : {}) },
    identities: [],
    created_at: iso(u.created_at),
    updated_at: iso(u.last_sign_in_at ?? u.created_at),
    last_sign_in_at: iso(u.last_sign_in_at),
    is_anonymous: false,
  };
}

export class SiweAuth {
  constructor(private d: AuthDeps) {}

  private nowMs() {
    return this.d.now ? this.d.now() : Date.now();
  }

  async createNonce(): Promise<string> {
    const nonce = generateSiweNonce();
    await this.d.db.query(
      `INSERT INTO auth.nonces (nonce, expires_at) VALUES ($1, to_timestamp($2))`,
      [nonce, Math.floor(this.nowMs() / 1000) + NONCE_TTL_SEC],
    );
    // housekeeping
    await this.d.db.query(`DELETE FROM auth.nonces WHERE expires_at < now() - interval '1 day'`);
    return nonce;
  }

  /** Verifies a signed SIWE message and returns a new session. `requestHost` is used when SIWE_DOMAINS is empty. */
  async verify(message: string, signature: string, requestHost?: string) {
    if (typeof message !== 'string' || message.length > 4000 || typeof signature !== 'string' || !/^0x[0-9a-fA-F]*$/.test(signature)) {
      throw new AuthError(400, 'validation_failed', 'message and signature are required');
    }
    const m = parseSiweMessage(message);
    if (!m.address || !isAddress(m.address) || !m.domain || !m.nonce || !m.chainId || !m.uri || m.version !== '1') {
      throw new AuthError(400, 'validation_failed', 'malformed SIWE message');
    }
    const domain = m.domain.toLowerCase();
    const allowed = this.d.siweDomains.length ? this.d.siweDomains : requestHost ? [requestHost.toLowerCase()] : [];
    if (!allowed.includes(domain)) throw new AuthError(401, 'bad_domain', `SIWE domain ${m.domain} is not allowed`);
    let uriHost = '';
    try {
      uriHost = new URL(m.uri).host.toLowerCase();
    } catch {
      /* invalid */
    }
    if (uriHost !== domain) throw new AuthError(401, 'bad_uri', 'SIWE uri does not match domain');

    const nowSec = Math.floor(this.nowMs() / 1000);
    const issued = m.issuedAt ? Math.floor(m.issuedAt.getTime() / 1000) : 0;
    if (!issued || issued > nowSec + 300 || nowSec - issued > MAX_MESSAGE_AGE_SEC) {
      throw new AuthError(401, 'stale_message', 'SIWE message is too old or from the future');
    }
    if (m.expirationTime && m.expirationTime.getTime() / 1000 <= nowSec) throw new AuthError(401, 'expired', 'SIWE message expired');
    if (m.notBefore && m.notBefore.getTime() / 1000 > nowSec) throw new AuthError(401, 'not_yet_valid', 'SIWE message not yet valid');

    const address = getAddress(m.address);
    const ok = await this.checkSignature(m.chainId, address, message, signature as Hex);
    if (!ok) throw new AuthError(401, 'invalid_signature', 'signature does not match the address');

    // Consume the nonce only after a valid signature (single use, unexpired).
    const used = await this.d.db.query(
      `UPDATE auth.nonces SET used_at = now() WHERE nonce = $1 AND used_at IS NULL AND expires_at > to_timestamp($2) RETURNING nonce`,
      [m.nonce, nowSec],
    );
    if (!used.rowCount) throw new AuthError(401, 'invalid_nonce', 'nonce unknown, expired or already used');

    const { rows } = await this.d.db.query<UserRow>(
      `INSERT INTO auth.users (wallet_address, last_sign_in_at) VALUES ($1, now())
       ON CONFLICT (wallet_address) DO UPDATE SET last_sign_in_at = now()
       RETURNING id, wallet_address, created_at, last_sign_in_at, raw_user_meta_data`,
      [address.toLowerCase()],
    );
    return this.issueSession(rows[0], randomUUID(), m.chainId);
  }

  async checkSignature(chainId: number, address: Address, message: string, signature: Hex): Promise<boolean> {
    if (signature.length === 132) {
      try {
        const recovered = await recoverMessageAddress({ message, signature });
        if (recovered.toLowerCase() === address.toLowerCase()) return true;
      } catch {
        /* not an EOA signature - fall through to EIP-1271 */
      }
    }
    try {
      return await this.d.erc1271(chainId, address, hashMessage(message), signature);
    } catch {
      return false;
    }
  }

  private async issueSession(user: UserRow, sessionId: string, chainId?: number) {
    const now = Math.floor(this.nowMs() / 1000);
    const exp = now + this.d.accessTtlSec;
    const claims: Claims = {
      iss: 'buy-simple-dca-api',
      sub: user.id,
      aud: 'authenticated',
      role: 'authenticated',
      iat: now,
      exp,
      session_id: sessionId,
      wallet_address: getAddress(user.wallet_address),
      aal: 'aal1',
      amr: [{ method: 'siwe', timestamp: now }],
      is_anonymous: false,
    };
    const access_token = signJwt(claims, this.d.jwtSecret);
    const refresh_token = randomBytes(32).toString('base64url');
    await this.d.db.query(
      `INSERT INTO auth.refresh_tokens (token_hash, user_id, session_id, expires_at) VALUES ($1, $2, $3, to_timestamp($4))`,
      [sha256(refresh_token), user.id, sessionId, now + this.d.refreshTtlSec],
    );
    return {
      access_token,
      token_type: 'bearer',
      expires_in: this.d.accessTtlSec,
      expires_at: exp,
      refresh_token,
      user: toGoTrueUser(user, chainId),
    };
  }

  /** Rotating refresh tokens; re-use of a rotated token revokes the whole session. */
  async refresh(refreshToken: string) {
    if (typeof refreshToken !== 'string' || refreshToken.length < 20) throw new AuthError(400, 'validation_failed', 'refresh_token required');
    const { rows } = await this.d.db.query<{ id: string; user_id: string; session_id: string; revoked_at: Date | null; expired: boolean }>(
      `SELECT id, user_id, session_id, revoked_at, expires_at <= to_timestamp($2) AS expired FROM auth.refresh_tokens WHERE token_hash = $1`,
      [sha256(refreshToken), Math.floor(this.nowMs() / 1000)],
    );
    const t = rows[0];
    if (!t) throw new AuthError(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found');
    if (t.revoked_at) {
      await this.revokeSession(t.session_id);
      throw new AuthError(400, 'refresh_token_already_used', 'Invalid Refresh Token: Already Used');
    }
    if (t.expired) throw new AuthError(400, 'session_expired', 'Session expired');
    const revoked = await this.d.db.query(`UPDATE auth.refresh_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL`, [t.id]);
    if (!revoked.rowCount) throw new AuthError(400, 'refresh_token_already_used', 'Invalid Refresh Token: Already Used');
    const user = await this.userById(t.user_id);
    if (!user) throw new AuthError(400, 'user_not_found', 'User not found');
    return this.issueSession(user, t.session_id);
  }

  async revokeSession(sessionId: string) {
    await this.d.db.query(`UPDATE auth.refresh_tokens SET revoked_at = now() WHERE session_id = $1 AND revoked_at IS NULL`, [sessionId]);
  }

  async revokeAllForUser(userId: string) {
    await this.d.db.query(`UPDATE auth.refresh_tokens SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL`, [userId]);
  }

  /** Validates an access token for an authenticated user (not anon/service tokens). */
  verifyAccessToken(token: string): Claims | null {
    const c = verifyJwt(token, this.d.jwtSecret, Math.floor(this.nowMs() / 1000));
    if (!c || c.role !== 'authenticated' || typeof c.sub !== 'string') return null;
    return c;
  }

  async userById(id: string): Promise<UserRow | null> {
    const { rows } = await this.d.db.query<UserRow>(
      `SELECT id, wallet_address, created_at, last_sign_in_at, raw_user_meta_data FROM auth.users WHERE id = $1`,
      [id],
    );
    return rows[0] ?? null;
  }

  async currentUser(token: string) {
    const c = this.verifyAccessToken(token);
    if (!c) throw new AuthError(401, 'bad_jwt', 'invalid JWT');
    const { rows } = await this.d.db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM auth.refresh_tokens WHERE session_id = $1 AND revoked_at IS NULL`,
      [c.session_id],
    );
    if (!rows[0]?.n) throw new AuthError(401, 'session_not_found', 'Session from session_id claim in JWT does not exist');
    const u = await this.userById(c.sub as string);
    if (!u) throw new AuthError(401, 'user_not_found', 'User from sub claim in JWT does not exist');
    return toGoTrueUser(u);
  }
}

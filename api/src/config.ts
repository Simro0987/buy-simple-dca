import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export class ConfigError extends Error {}

/** KEY=VALUE lines (# comments, optional quotes). Used for the secrets file on the Flux volume. */
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i <= 0) continue;
    const k = line.slice(0, i).trim().replace(/^export\s+/, '');
    let v = line.slice(i + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (/^[A-Z][A-Z0-9_]*$/.test(k)) out[k] = v;
  }
  return out;
}

const readMaybe = (p: string | undefined): string | undefined => {
  if (!p) return undefined;
  try {
    return readFileSync(p, 'utf8').trim();
  } catch {
    return undefined;
  }
};

/** Secret persisted on the API's own volume so sessions survive restarts. */
function persistentSecret(path: string, bytes = 48): string {
  const existing = readMaybe(path);
  if (existing && existing.length >= 32) return existing;
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const v = randomBytes(bytes).toString('hex');
  writeFileSync(path, v + '\n', { mode: 0o600 });
  return v;
}

export interface ApiConfig {
  port: number;
  host: string;
  dataDir: string;
  db: { host: string; port: number; user: string; database: string; password: string };
  jwtSecret: string;
  edgeSecret: string;
  postgrest: { bin: string; port: number; pool: number };
  allowedOrigins: string[];
  siweDomains: string[];
  accessTtlSec: number;
  refreshTtlSec: number;
  rpcUrls: Record<number, string>;
  scheduler: boolean;
  importDir: string;
  /** Server-only secrets made visible to the ported edge functions via Deno.env. */
  secrets: Record<string, string>;
}

const FUNCTION_SECRET_KEYS = [
  'TELEGRAM_BOT_TOKEN',
  'CRYPTOPANIC_API_KEY',
  'ETHERSCAN_API_KEY',
  'MOBULA_API_KEY',
  'AI_BASE_URL',
  'AI_API_KEY',
  'AI_MODEL',
] as const;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const dataDir = env.DATA_DIR || '/appdata';
  const fileSecrets = env.API_SECRETS_FILE ? parseEnvFile(readMaybe(env.API_SECRETS_FILE) ?? '') : {};
  const get = (k: string): string | undefined => env[k] || fileSecrets[k] || readMaybe(env[`${k}_FILE`]);

  const password = get('DB_PASSWORD') ?? readMaybe(env.DB_PASSWORD_FILE || '/run/secrets/db/postgres_password');
  if (!password) {
    throw new ConfigError('database password not found (DB_PASSWORD, DB_PASSWORD_FILE or /run/secrets/db/postgres_password)');
  }
  const jwtSecret = get('JWT_SECRET') ?? persistentSecret(join(dataDir, 'secrets', 'jwt_secret'));
  if (jwtSecret.length < 32) throw new ConfigError('JWT_SECRET must be at least 32 characters');
  const edgeSecret = get('EDGE_FUNCTION_SECRET') ?? persistentSecret(join(dataDir, 'secrets', 'edge_function_secret'), 24);

  const rpcUrls: Record<number, string> = {};
  for (const [k, v] of Object.entries(env)) {
    const m = /^RPC_URL_(\d+)$/.exec(k);
    if (m && v) rpcUrls[Number(m[1])] = v;
  }
  const list = (v?: string) => (v ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const secrets: Record<string, string> = {};
  for (const k of FUNCTION_SECRET_KEYS) {
    const v = get(k);
    if (v) secrets[k] = v;
  }

  return {
    port: Number(env.API_PORT || 8070),
    host: env.API_HOST || '0.0.0.0',
    dataDir,
    db: {
      host: env.DB_HOST || 'db',
      port: Number(env.DB_PORT || 5432),
      user: env.DB_USER || 'postgres',
      database: env.DB_NAME || 'postgres',
      password,
    },
    jwtSecret,
    edgeSecret,
    postgrest: {
      bin: env.POSTGREST_BIN || '/usr/local/bin/postgrest',
      port: Number(env.POSTGREST_PORT || 3000),
      pool: Number(env.POSTGREST_POOL || 5),
    },
    allowedOrigins: list(env.API_ALLOWED_ORIGINS),
    siweDomains: list(env.SIWE_DOMAINS).map((d) => d.toLowerCase()),
    accessTtlSec: Number(env.ACCESS_TOKEN_TTL || 3600),
    refreshTtlSec: Number(env.REFRESH_TOKEN_TTL || 30 * 24 * 3600),
    rpcUrls,
    scheduler: (env.SCHEDULER_ENABLED ?? 'true') !== 'false',
    importDir: env.IMPORT_DIR || join(dataDir, 'import'),
    secrets,
  };
}

export const fileExists = existsSync;

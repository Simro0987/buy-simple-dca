/** JSON-lines logger that never prints private keys (anything shaped like a 32-byte hex secret). */
const SECRET_RE = /0x[0-9a-fA-F]{64}/g;
const SECRET_KEY_RE = /(private|secret|mnemonic|seed|password|apikey|api_key|authorization|bearer|^token$|statustoken)/i;
/** Public 32-byte values (tx hashes) are allowed under these keys only. */
const PUBLIC_HASH_KEYS = new Set(['txHash', 'hash', 'blockHash']);

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(SECRET_RE, '0x[REDACTED]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (SECRET_KEY_RE.test(k)) out[k] = '[REDACTED]';
      else if (PUBLIC_HASH_KEYS.has(k) && typeof v === 'string' && /^0x[0-9a-fA-F]{64}$/.test(v)) out[k] = v;
      else out[k] = redact(v);
    }
    return out;
  }
  if (typeof value === 'bigint') return value.toString();
  return value;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type Logger = (level: LogLevel, msg: string, data?: Record<string, unknown>) => void;

export const consoleLogger: Logger = (level, msg, data) => {
  const line = JSON.stringify(
    { t: new Date().toISOString(), level, msg, ...(data ? (redact(data) as object) : {}) },
    (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
  );
  if (level === 'error' || level === 'warn') console.error(line);
  else console.log(line);
};

/**
 * Error text that is safe to log AND to show on the public /status endpoint:
 * strips URLs (RPC URLs often embed API keys), hex secrets, and truncates.
 */
export function safeError(e: unknown, max = 300): string {
  const raw = e instanceof Error ? (e as { shortMessage?: string }).shortMessage || e.message : String(e);
  return raw
    .replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"')]+/gi, '<url>')
    .replace(/0x[0-9a-fA-F]{64}/g, '[REDACTED]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

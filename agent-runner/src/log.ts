/** JSON-lines logger that never prints private keys (anything shaped like a 32-byte hex secret). */
const SECRET_RE = /0x[0-9a-fA-F]{64}/g;
const SECRET_KEY_RE = /(private|secret|mnemonic|seed|token)/i;

export function redact(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(SECRET_RE, '0x[REDACTED]');
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = SECRET_KEY_RE.test(k) ? '[REDACTED]' : redact(v);
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

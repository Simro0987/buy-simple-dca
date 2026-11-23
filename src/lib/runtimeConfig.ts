/**
 * Runtime configuration.
 *
 * Vite inlines `import.meta.env.VITE_*` at BUILD time, so env vars set on Flux / Docker at
 * RUN time would otherwise be ignored. The Docker image generates `/env-config.js`
 * (window.__APP_CONFIG__) from an allow-list of PUBLIC env vars at container start.
 * Runtime values win; build-time values are the fallback.
 *
 * Never put secrets here: everything in this object is readable by any visitor.
 */
export type RuntimeConfigKey =
  | 'VITE_API_URL'
  | 'VITE_PUBLIC_APP_URL'
  | 'VITE_WALLETCONNECT_PROJECT_ID'
  | 'VITE_SYSTEM_EXECUTION_MODE'
  | 'VITE_DEFAULT_SAFE_CHAIN'
  | 'VITE_AGENT_STATUS_URL';

/** Old names still accepted (older Flux specs); remove once every deployment uses the new ones. */
const LEGACY_ALIASES: Partial<Record<RuntimeConfigKey, string>> = {
  VITE_API_URL: 'VITE_SUPABASE_URL',
};

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<Record<string, string>>;
  }
}

const BUILD_TIME: Partial<Record<RuntimeConfigKey, string | undefined>> = {
  VITE_API_URL: import.meta.env.VITE_API_URL,
  VITE_PUBLIC_APP_URL: import.meta.env.VITE_PUBLIC_APP_URL,
  VITE_WALLETCONNECT_PROJECT_ID: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  VITE_SYSTEM_EXECUTION_MODE: import.meta.env.VITE_SYSTEM_EXECUTION_MODE,
  VITE_DEFAULT_SAFE_CHAIN: import.meta.env.VITE_DEFAULT_SAFE_CHAIN,
  VITE_AGENT_STATUS_URL: import.meta.env.VITE_AGENT_STATUS_URL,
};

export function runtimeEnv(key: RuntimeConfigKey): string {
  const cfg = typeof window !== 'undefined' ? window.__APP_CONFIG__ : undefined;
  const legacy = LEGACY_ALIASES[key];
  const fromWindow = cfg?.[key] || (legacy ? cfg?.[legacy] : undefined);
  const value = (fromWindow && String(fromWindow).trim()) || BUILD_TIME[key] || '';
  return String(value);
}

/** Public URL of this app (Flux default domain or own domain); falls back to the current origin. */
export function publicAppUrl(): string {
  const v = runtimeEnv('VITE_PUBLIC_APP_URL').replace(/\/+$/, '');
  if (v) return v;
  return typeof window !== 'undefined' ? window.location.origin : '';
}

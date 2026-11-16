/**
 * Runtime configuration.
 *
 * Vite inlines `import.meta.env.VITE_*` at BUILD time, so env vars set on Flux / Akash /
 * Docker at RUN time would otherwise be ignored. The Docker image generates `/env-config.js`
 * (window.__APP_CONFIG__) from an allow-list of PUBLIC env vars at container start.
 * Runtime values win; build-time values are the fallback.
 *
 * Never put secrets here: everything in this object is readable by any visitor.
 */
export type RuntimeConfigKey =
  | 'VITE_SUPABASE_URL'
  | 'VITE_SUPABASE_PUBLISHABLE_KEY'
  | 'VITE_SUPABASE_PROJECT_ID'
  | 'VITE_WALLETCONNECT_PROJECT_ID'
  | 'VITE_SYSTEM_EXECUTION_MODE'
  | 'VITE_DEFAULT_SAFE_CHAIN';

declare global {
  interface Window {
    __APP_CONFIG__?: Partial<Record<RuntimeConfigKey, string>>;
  }
}

const BUILD_TIME: Partial<Record<RuntimeConfigKey, string | undefined>> = {
  VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  VITE_SUPABASE_PROJECT_ID: import.meta.env.VITE_SUPABASE_PROJECT_ID,
  VITE_WALLETCONNECT_PROJECT_ID: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID,
  VITE_SYSTEM_EXECUTION_MODE: import.meta.env.VITE_SYSTEM_EXECUTION_MODE,
  VITE_DEFAULT_SAFE_CHAIN: import.meta.env.VITE_DEFAULT_SAFE_CHAIN,
};

export function runtimeEnv(key: RuntimeConfigKey): string {
  const fromWindow =
    typeof window !== 'undefined' ? window.__APP_CONFIG__?.[key] : undefined;
  const value = (fromWindow && String(fromWindow).trim()) || BUILD_TIME[key] || '';
  return String(value);
}

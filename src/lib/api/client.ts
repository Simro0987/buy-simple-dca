/**
 * Browser client for the own API (Flux component "api", proxied by nginx under /api).
 * VITE_API_URL is a runtime value (see runtimeConfig.ts); a relative path is resolved
 * against the current origin. Import it like this:  import { api } from '@/lib/api/client';
 */
import { createClient } from './core';
import { runtimeEnv } from '@/lib/runtimeConfig';

/** Absolute base URL of the API (no trailing slash). */
export function apiBaseUrl(): string {
  const raw = (runtimeEnv('VITE_API_URL') || '/api').replace(/\/+$/, '');
  if (raw.startsWith('/') && typeof window !== 'undefined') return `${window.location.origin}${raw}`;
  return raw;
}

export const api = createClient(apiBaseUrl(), '', {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'bsd-auth-session' },
});

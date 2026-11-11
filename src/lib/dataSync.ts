/**
 * Global data sync — fresh fetch on every app load, every hour, and on demand.
 *
 * `cacheEpoch` marks the start of the current sync window: persistent caches
 * (freeCache, apiCache) treat anything saved before it as stale, so the next
 * read refetches. Stale values are still served if a refetch fails.
 */
import { useSyncExternalStore } from 'react';
import type { QueryClient } from '@tanstack/react-query';
import { invalidateOracles } from './oracleRegistry';

export const SYNC_INTERVAL_MS = 60 * 60_000;

let cacheEpoch = Date.now();
let lastSyncAt: number | null = null;
let syncing = false;
const listeners = new Set<() => void>();
let snap = { lastSyncAt, syncing };
const emit = () => { snap = { lastSyncAt, syncing }; listeners.forEach(l => l()); };

export function getCacheEpoch(): number { return cacheEpoch; }

export async function syncNow(qc: QueryClient): Promise<void> {
  if (syncing) return;
  cacheEpoch = Date.now();
  invalidateOracles();
  syncing = true; emit();
  try {
    await qc.invalidateQueries({ refetchType: 'active' });
  } finally {
    syncing = false;
    lastSyncAt = Date.now();
    emit();
  }
}

export function useDataSyncState() {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => snap,
  );
}

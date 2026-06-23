const TTL_MS = 5 * 60 * 1000;
const PREFIX = 'api-cache-v1:';

interface CacheEntry<T> {
  data: T;
  savedAt: number;
}

const memory = new Map<string, CacheEntry<unknown>>();

function storageKey(key: string): string {
  return `${PREFIX}${key}`;
}

export function readCache<T>(key: string): T | null {
  const mem = memory.get(key) as CacheEntry<T> | undefined;
  if (mem && Date.now() - mem.savedAt < TTL_MS) return mem.data;

  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    if (Date.now() - parsed.savedAt >= TTL_MS) return null;
    memory.set(key, parsed);
    return parsed.data;
  } catch {
    return null;
  }
}

export function readStaleCache<T>(key: string): T | null {
  const mem = memory.get(key) as CacheEntry<T> | undefined;
  if (mem) return mem.data;
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry<T>;
    memory.set(key, parsed);
    return parsed.data;
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  const entry: CacheEntry<T> = { data, savedAt: Date.now() };
  memory.set(key, entry);
  try {
    localStorage.setItem(storageKey(key), JSON.stringify(entry));
  } catch { /* quota */ }
}

export function clearApiCache(prefix?: string): void {
  if (!prefix) {
    memory.clear();
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith(PREFIX)) keys.push(k);
      }
      keys.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }
    return;
  }
  for (const k of [...memory.keys()]) {
    if (k.startsWith(prefix)) memory.delete(k);
  }
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(`${PREFIX}${prefix}`)) keys.push(k);
    }
    keys.forEach(k => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

export async function fetchWithCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  opts?: { force?: boolean; allowStaleOnError?: boolean },
): Promise<{ data: T; fromCache: boolean; stale: boolean }> {
  if (!opts?.force) {
    const fresh = readCache<T>(key);
    if (fresh !== null) return { data: fresh, fromCache: true, stale: false };
  }

  try {
    const data = await fetcher();
    writeCache(key, data);
    return { data, fromCache: false, stale: false };
  } catch (err) {
    if (opts?.allowStaleOnError !== false) {
      const stale = readStaleCache<T>(key);
      if (stale !== null) return { data: stale, fromCache: true, stale: true };
    }
    throw err;
  }
}

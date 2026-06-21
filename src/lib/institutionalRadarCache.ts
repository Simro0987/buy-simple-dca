/**
 * Inštitucionálny radar — cache správ s 12h TTL.
 */
import { supabase } from '@/integrations/supabase/client';
import type { OctToken } from '@/hooks/useConfluenceMetrics';

export const RADAR_CACHE_KEY = 'institutional-radar-messages-v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export type RadarNewsType = 'normal' | 'alert';

export interface CachedRadarItem {
  title: string;
  type: RadarNewsType;
  tag?: string;
  source: string;
}

interface RadarCacheEnvelope {
  ts: number;
  messages: Record<OctToken, CachedRadarItem[]>;
}

const FALLBACK: Record<OctToken, CachedRadarItem[]> = {
  BTC: [{ title: 'BTC makro radar synchronizuje…', type: 'normal', source: 'Systém' }],
  ETH: [{ title: 'ETH makro radar synchronizuje…', type: 'normal', source: 'Systém' }],
  SOL: [{ title: 'SOL makro radar synchronizuje…', type: 'normal', source: 'Systém' }],
};

function readCache(): RadarCacheEnvelope | null {
  try {
    const raw = localStorage.getItem(RADAR_CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as RadarCacheEnvelope;
  } catch {
    return null;
  }
}

function writeCache(messages: Record<OctToken, CachedRadarItem[]>): void {
  try {
    const env: RadarCacheEnvelope = { ts: Date.now(), messages };
    localStorage.setItem(RADAR_CACHE_KEY, JSON.stringify(env));
  } catch { /* quota */ }
}

function isStale(env: RadarCacheEnvelope | null): boolean {
  if (!env) return true;
  return Date.now() - env.ts > CACHE_TTL_MS;
}

function mapApiNews(items: Array<{ title?: string; summary?: string; source?: string; impact?: string; sentiment?: string }>): CachedRadarItem[] {
  return items.slice(0, 6).map(n => ({
    title: n.title || n.summary || 'Bez názvu',
    type: n.impact === 'high' ? 'alert' as const : 'normal' as const,
    tag: n.impact === 'high' ? 'Flash' : undefined,
    source: n.source || 'Crypto News',
  }));
}

async function fetchTokenNews(token: OctToken): Promise<CachedRadarItem[]> {
  const { data, error } = await supabase.functions.invoke('crypto-news', {
    body: { currencies: token, kind: 'news', lang: 'sk' },
  });
  if (error || !data?.success) throw new Error(error?.message || 'fetch failed');
  const mapped = mapApiNews(data.data ?? []);
  return mapped.length > 0 ? mapped : FALLBACK[token];
}

/** Načíta cache alebo stiahne čerstvé správy (12h TTL). */
export async function loadInstitutionalRadarMessages(
  force = false,
): Promise<Record<OctToken, CachedRadarItem[]>> {
  const cached = readCache();
  if (!force && cached && !isStale(cached)) return cached.messages;

  const tokens: OctToken[] = ['BTC', 'ETH', 'SOL'];
  const messages = { ...FALLBACK } as Record<OctToken, CachedRadarItem[]>;

  await Promise.all(tokens.map(async (t) => {
    try {
      messages[t] = await fetchTokenNews(t);
    } catch (e) {
      console.warn(`[Radar] ${t} fetch failed, keeping cache/fallback`, e);
      if (cached?.messages[t]?.length) messages[t] = cached.messages[t];
    }
  }));

  writeCache(messages);
  return messages;
}

export function getCachedRadarMessages(token: OctToken): CachedRadarItem[] | null {
  const cached = readCache();
  if (!cached || isStale(cached)) return null;
  return cached.messages[token] ?? null;
}

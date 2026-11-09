/**
 * Central API Hub — one memoized fetch of the server `btc-indicators` node.
 * Header, oracle registry (all screens, Telegram-facing values) and the Stake
 * "API & indikátory" box all read this same payload so numbers never disagree.
 */
import type { BtcIndicators } from '@/hooks/useBtcIndicators';

const MEMO_MS = 60_000;
let hit: { at: number; p: Promise<BtcIndicators> } | null = null;

export function fetchCentralHub(): Promise<BtcIndicators> {
  if (hit && Date.now() - hit.at < MEMO_MS) return hit.p;
  const p = fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/btc-indicators`)
    .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json() as Promise<BtcIndicators>; })
    .catch((e) => { hit = null; throw e; });
  hit = { at: Date.now(), p };
  return p;
}

export function invalidateCentralHub() { hit = null; }

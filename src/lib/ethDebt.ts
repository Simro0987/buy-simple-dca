// Cloud-backed ETH debt tracker (source of truth: public.defi_positions.eth_debt).
// Sync API surface backed by in-memory cache; hydrated by CloudSyncProvider.

import { supabase } from '@/integrations/supabase/client';

const EVT = 'eth-borrow-debt-change';
export const ETH_DEBT_EVENT = EVT;

let cache = 0;
let currentUserId: string | null = null;

function emit(): void {
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch { /* noop */ }
}

export function setEthDebtUser(userId: string | null): void { currentUserId = userId; }
export function setEthDebtCache(v: number): void { cache = Math.max(0, Number(v) || 0); emit(); }

export function loadEthDebt(): number { return cache; }

function persist(amount: number): void {
  cache = Math.max(0, amount);
  emit();
  if (!currentUserId) return;
  void supabase.from('defi_positions').upsert(
    { user_id: currentUserId, eth_debt: cache },
    { onConflict: 'user_id' },
  );
}

export function addEthDebt(delta: number): number {
  persist(cache + Math.max(0, delta));
  return cache;
}

export function subtractEthDebt(delta: number): number {
  persist(Math.max(0, cache - Math.max(0, delta)));
  return cache;
}

export function resetEthDebt(): void { persist(0); }

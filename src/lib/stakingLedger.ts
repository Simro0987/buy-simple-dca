// Cloud-backed staking ledger (source of truth: public.staking_positions).
// Keeps sync API surface via in-memory cache; hydrated by CloudSyncProvider.
// All writes go to Supabase; localStorage is no longer used.

import { supabase } from '@/integrations/supabase/client';

export type LedgerSymbol = 'BTC' | 'ETH' | 'SOL' | 'LINK' | 'AAVE' | 'HYPE';

export interface StakedEntry {
  symbol: LedgerSymbol;
  protocol: string;
  amount: number;
}

const EVT = 'staking-ledger-change';
export const STAKING_LEDGER_EVENT = EVT;

export const PROTOCOL_PRESETS: Record<LedgerSymbol, string[]> = {
  BTC: ['Babylon Staking', 'Lombard LBTC', 'Morpho Blue LBTC'],
  ETH: ['Rocket Pool (rETH)', 'Ether.fi (weETH)', 'Kiln (Solo Manage)', 'Aave V3 Lending'],
  SOL: ['Marinade Native (mSOL)', 'Kamino Autopilot'],
  LINK: ['Morpho Blue (Arbitrum Supply)'],
  AAVE: ['Morpho Blue (Arbitrum Supply)'],
  
  HYPE: ['HyperCore Native Staking'],
};

let cache: StakedEntry[] = [];
let currentUserId: string | null = null;

function emit(): void {
  try { window.dispatchEvent(new CustomEvent(EVT)); } catch { /* noop */ }
}

/** Called by CloudSyncProvider on auth changes. */
export async function hydrateStakingLedger(userId: string | null): Promise<void> {
  currentUserId = userId;
  if (!userId) { cache = []; emit(); return; }
  const { data, error } = await supabase
    .from('staking_positions')
    .select('symbol,protocol,amount')
    .eq('user_id', userId);
  if (error) { cache = []; emit(); return; }
  cache = (data ?? []).map(r => ({
    symbol: r.symbol as LedgerSymbol,
    protocol: r.protocol as string,
    amount: Number(r.amount) || 0,
  }));
  emit();
}

export function getLedger(): StakedEntry[] {
  return cache.slice();
}

export function addStake(symbol: LedgerSymbol, protocol: string, amount: number): void {
  if (amount <= 0 || !currentUserId) return;
  const idx = cache.findIndex(e => e.symbol === symbol && e.protocol === protocol);
  const next = idx >= 0 ? cache[idx].amount + amount : amount;
  if (idx >= 0) cache[idx] = { ...cache[idx], amount: next };
  else cache.push({ symbol, protocol, amount: next });
  emit();
  void supabase.from('staking_positions').upsert(
    { user_id: currentUserId, symbol, protocol, amount: next },
    { onConflict: 'user_id,symbol,protocol' },
  );
}

export function removeStake(symbol: LedgerSymbol, protocol: string, amount: number): number {
  if (amount <= 0 || !currentUserId) return 0;
  const idx = cache.findIndex(e => e.symbol === symbol && e.protocol === protocol);
  if (idx < 0) return 0;
  const current = cache[idx].amount;
  const taken = Math.min(current, amount);
  const next = current - taken;
  if (next <= 1e-12) {
    cache.splice(idx, 1);
    void supabase.from('staking_positions').delete()
      .eq('user_id', currentUserId).eq('symbol', symbol).eq('protocol', protocol);
  } else {
    cache[idx] = { ...cache[idx], amount: next };
    void supabase.from('staking_positions').upsert(
      { user_id: currentUserId, symbol, protocol, amount: next },
      { onConflict: 'user_id,symbol,protocol' },
    );
  }
  emit();
  return taken;
}

export function deleteEntry(symbol: LedgerSymbol, protocol: string): void {
  if (!currentUserId) return;
  cache = cache.filter(e => !(e.symbol === symbol && e.protocol === protocol));
  emit();
  void supabase.from('staking_positions').delete()
    .eq('user_id', currentUserId).eq('symbol', symbol).eq('protocol', protocol);
}

export function getStakedBySymbol(): Record<LedgerSymbol, number> {
  const out: Record<LedgerSymbol, number> = { BTC: 0, ETH: 0, SOL: 0, LINK: 0, AAVE: 0, HYPE: 0 };
  for (const e of cache) out[e.symbol] += e.amount;
  return out;
}

export function getStakedBreakdown(): Record<LedgerSymbol, StakedEntry[]> {
  const out: Record<LedgerSymbol, StakedEntry[]> = { BTC: [], ETH: [], SOL: [], LINK: [], AAVE: [], HYPE: [] };
  for (const e of cache) out[e.symbol].push(e);
  return out;
}

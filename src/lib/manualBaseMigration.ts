/**
 * One-time migration: manual "base balances" (localStorage) → history records.
 *
 * - Token already has history → history is the source of truth; manual base is reset to 0
 *   (it was being double-counted on top of history).
 * - Token without history but with manual qty + WACB → inserted as a single "Initial BUY"
 *   at that WACB (cost basis preserved), then the manual base is reset to 0.
 */
import { supabase } from '@/integrations/supabase/client';
import { getHoldings, setHolding } from '@/lib/portfolioHoldings';
import { HARVEST_TOKENS } from '@/lib/harvestEngine';
import { basketAsset } from '@/lib/assetBaskets';
import { clearAssetLayerOverride } from '@/stores/assetLayerOverrideStore';
import { getActiveStakes, removeActiveStake } from '@/stores/activeStakingStore';

const DONE_KEY = 'manual-base-migrated-v1';

export async function migrateManualBaseToHistory(): Promise<boolean> {
  if (localStorage.getItem(DONE_KEY)) return false;
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes.user?.id;
  if (!uid) return false;

  const { data: txs, error } = await supabase.from('token_transactions').select('symbol');
  if (error) return false;
  const withHistory = new Set((txs ?? []).map(t => String(t.symbol).toUpperCase()));

  const manual = getHoldings();
  for (const t of HARVEST_TOKENS) {
    const m = manual[t];
    if (!m || m.qty <= 0) continue;
    if (!withHistory.has(t) && m.wacb > 0) {
      const cgId = basketAsset(t)?.cgId || t.toLowerCase();
      const { error: insErr } = await supabase.from('token_transactions').insert({
        user_id: uid, coingecko_id: cgId, symbol: t, side: 'buy',
        quantity: m.qty, price_usd: m.wacb, note: 'Initial BUY (migrated manual base)',
      });
      if (insErr) return false; // keep manual base; retry next load
    }
    setHolding(t, { qty: 0 });
  }
  localStorage.setItem(DONE_KEY, new Date().toISOString());
  return true;
}

/**
 * One-time: drop device-only staking state for ETH/SOL so the cloud
 * staking ledger (exact staked amounts) is the only source.
 */
export function resetLocalStakeStateOnce(): void {
  const KEY = 'local-stake-state-reset-v1';
  try {
    if (localStorage.getItem(KEY)) return;
    for (const s of ['ETH', 'SOL']) {
      clearAssetLayerOverride(s);
      for (const r of getActiveStakes()) if (r.symbol === s) removeActiveStake(r.id);
    }
    localStorage.setItem(KEY, new Date().toISOString());
  } catch { /* noop */ }
}

import { useCyborgEngine } from '@/stores/cyborgEngine';
import type { CyborgAsset } from '@/stores/cyborgEngine';

export const HOLDINGS_STORAGE_KEY = 'smart-alloc-holdings';

export type HoldingsRecord = Partial<Record<'btc' | 'eth' | 'sol', number>>;

export function holdingsRecordFromManual(
  manual?: HoldingsRecord | null,
): HoldingsRecord {
  return {
    btc: Number(manual?.btc ?? 0) || 0,
    eth: Number(manual?.eth ?? 0) || 0,
    sol: Number(manual?.sol ?? 0) || 0,
  };
}

export function loadHoldingsRecord(): HoldingsRecord {
  try {
    return JSON.parse(localStorage.getItem(HOLDINGS_STORAGE_KEY) || '{}') as HoldingsRecord;
  } catch {
    return {};
  }
}

export function saveHoldingsRecord(record: HoldingsRecord): void {
  try {
    localStorage.setItem(HOLDINGS_STORAGE_KEY, JSON.stringify(record));
  } catch {
    /* quota */
  }
}

/** Writes Supabase/manual holdings into localStorage and refreshes the cyborg engine. */
export function syncManualHoldingsToEngine(manual?: HoldingsRecord | null): void {
  const next = holdingsRecordFromManual(manual);
  saveHoldingsRecord(next);
  useCyborgEngine.getState().syncFromSources({ holdings: next });
  window.dispatchEvent(new Event('portfolio-updated'));
}

export function walletQtyForAsset(symbol: CyborgAsset): number {
  const wallet = useCyborgEngine.getState().walletBalances;
  return Number(wallet?.[symbol] ?? 0) || 0;
}

export function stakedQtyForAsset(symbol: CyborgAsset): number {
  const positions = useCyborgEngine.getState().stakingPositions ?? [];
  return positions
    .filter(p => p.symbol === symbol)
    .reduce((sum, p) => sum + (Number(p.amount ?? 0) || 0), 0);
}

export function totalQtyForAsset(symbol: CyborgAsset): number {
  return walletQtyForAsset(symbol) + stakedQtyForAsset(symbol);
}

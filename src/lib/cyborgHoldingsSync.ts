import { useCyborgEngine } from '@/stores/cyborgEngine';
import type { CyborgAsset } from '@/stores/cyborgEngine';
import {
  type HoldingsRecord,
  holdingsRecordFromUserHoldings,
  loadHoldingsRecord,
  loadUserHoldings,
  saveHoldingsRecord,
  saveUserHoldings,
  type UserHoldings,
} from '@/lib/portfolioRealHoldings';
import { syncUserHoldingsToEngine } from '@/lib/userHoldingsPersistence';

/** @deprecated use PORTFOLIO_REAL_HOLDINGS_KEY */
export const HOLDINGS_STORAGE_KEY = 'portfolio_real_holdings';

export type { HoldingsRecord };

export function holdingsRecordFromManual(
  manual?: HoldingsRecord | null,
): HoldingsRecord {
  return {
    btc: Number(manual?.btc ?? 0) || 0,
    eth: Number(manual?.eth ?? 0) || 0,
    sol: Number(manual?.sol ?? 0) || 0,
  };
}

export { loadHoldingsRecord, saveHoldingsRecord, syncUserHoldingsToEngine, loadUserHoldings };

/** Writes holdings into portfolio_real_holdings and refreshes the cyborg engine. */
export function syncManualHoldingsToEngine(manual?: HoldingsRecord | null): void {
  const next = holdingsRecordFromManual(manual);
  saveHoldingsRecord(next);
  useCyborgEngine.getState().syncFromSources({ holdings: next });
}

export function syncUserHoldingsRecordToEngine(holdings: UserHoldings): void {
  saveUserHoldings(holdings);
  useCyborgEngine.getState().syncFromSources({
    holdings: holdingsRecordFromUserHoldings(holdings),
  });
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

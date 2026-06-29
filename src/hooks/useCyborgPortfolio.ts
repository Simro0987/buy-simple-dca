import { useMemo } from 'react';
import { useCyborgEngine, type PortfolioSnapshot } from '@/stores/cyborgEngine';

/** Reactive read of the unified cyborg portfolio snapshot (wallet + staked per asset). */
export function useCyborgPortfolio(): PortfolioSnapshot {
  const revision = useCyborgEngine(s => s.revision);
  const walletBalances = useCyborgEngine(s => s.walletBalances);
  const stakingPositions = useCyborgEngine(s => s.stakingPositions);
  const prices = useCyborgEngine(s => s.prices);

  return useMemo(
    () => useCyborgEngine.getState().getPortfolioSnapshot(),
    [revision, walletBalances, stakingPositions, prices],
  );
}

/** Wallet quantity for a tracked asset — liquid only (excludes staked). */
export function useCyborgWalletQty(symbol: 'BTC' | 'ETH' | 'SOL'): number {
  const revision = useCyborgEngine(s => s.revision);
  const qty = useCyborgEngine(s => Number(s.walletBalances?.[symbol] ?? 0));
  return useMemo(() => (Number.isFinite(qty) ? Math.max(0, qty) : 0), [revision, qty]);
}

/** Total portfolio USD from the cyborg engine. */
export function useCyborgTotalUsd(): number {
  const revision = useCyborgEngine(s => s.revision);
  return useMemo(() => {
    const total = Number(useCyborgEngine.getState().getComputed().totalBalanceUsd ?? 0);
    return Number.isFinite(total) ? Math.max(0, total) : 0;
  }, [revision]);
}

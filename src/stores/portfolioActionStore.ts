import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { recordActiveStake, reduceActiveStake, type StakeKind } from './activeStakingStore';
import { addAssetDebt, repayAssetDebt } from './assetDebtStore';

export interface DefiActionRecord {
  id: string;
  amount: number;
  symbol: string;
  ts: number;
}

export interface PortfolioAction {
  id: string;
  symbol: string;
  amount: number;
  stakeProtocol?: string;
  unstakeProtocol?: string;
  stakeKind?: StakeKind;
  stakeApy?: number;
  debtAsset?: string;
  debtUsd?: number;
  repay?: boolean;
}

interface PortfolioActionState {
  store: Record<string, DefiActionRecord>;
  isDone: (id: string) => boolean;
  record: (id: string, symbol: string, amount: number) => boolean;
  execute: (action: PortfolioAction) => boolean;
  reset: (prefix?: string) => void;
}

/** Shared confirmations and portfolio layer transfers. Never adds a second BUY. */
export const usePortfolioActionStore = create<PortfolioActionState>()(persist((set, get) => ({
  store: {},
  isDone: id => !!get().store[id],
  record: (id, symbol, amount) => {
    if (!id || !Number.isFinite(amount) || amount <= 0 || get().store[id]) return false;
    set(s => ({ store: { ...s.store, [id]: { id, symbol, amount, ts: Date.now() } } }));
    return true;
  },
  execute: action => {
    if (!action.id || get().isDone(action.id) || !Number.isFinite(action.amount) || action.amount <= 0) return false;
    if (action.stakeProtocol) recordActiveStake(action.symbol, action.stakeProtocol, action.amount, action.stakeApy, action.stakeKind);
    if (action.unstakeProtocol) reduceActiveStake(action.symbol, action.unstakeProtocol, action.amount);
    if (action.debtAsset && action.debtUsd && action.debtUsd > 0) {
      if (action.repay) repayAssetDebt(action.debtAsset, action.debtUsd);
      else addAssetDebt(action.debtAsset, action.debtUsd);
    }
    return get().record(action.id, action.symbol, action.amount);
  },
  reset: prefix => set(s => ({ store: prefix ? Object.fromEntries(Object.entries(s.store).filter(([id]) => !id.startsWith(prefix))) : {} })),
}), {
  name: 'portfolio-action-store-v1',
  partialize: state => ({ store: state.store }),
  merge: (persisted, current) => {
    let legacy = {};
    try { legacy = JSON.parse(localStorage.getItem('defi-action-store-v1') ?? '{}'); } catch { /* no legacy */ }
    const saved = persisted as { store?: Record<string, DefiActionRecord> } | undefined;
    return { ...current, store: saved?.store ?? legacy };
  },
}));
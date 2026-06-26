/**
 * Cyborg Terminal — global state (Zustand)
 * Tracks per-asset wallet / staked / collateral / debt balances.
 * Persisted to localStorage so refresh keeps tactical positions.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type CyborgAsset = 'BTC' | 'ETH' | 'SOL';

export interface AssetBalances {
  wallet: number;     // free, liquid
  staked: number;     // earning yield
  collateral: number; // supplied to lending market
  debt: number;       // borrowed against collateral (in same asset units for simplicity)
}

const empty = (): AssetBalances => ({ wallet: 0, staked: 0, collateral: 0, debt: 0 });

export interface CyborgTerminalState {
  balances: Record<CyborgAsset, AssetBalances>;
  // mutations
  deposit: (asset: CyborgAsset, qty: number) => void;       // external → wallet
  stake: (asset: CyborgAsset, qty: number) => void;         // wallet → staked
  unstake: (asset: CyborgAsset, qty: number) => void;       // staked → wallet
  supply: (asset: CyborgAsset, qty: number) => void;        // wallet → collateral
  withdraw: (asset: CyborgAsset, qty: number) => void;      // collateral → wallet
  borrow: (asset: CyborgAsset, qty: number) => void;        // +debt, +wallet
  repay: (asset: CyborgAsset, qty: number) => void;         // -wallet, -debt
  reset: () => void;
}

const safeQty = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);

export const useCyborgTerminal = create<CyborgTerminalState>()(
  persist(
    (set) => ({
      balances: { BTC: empty(), ETH: empty(), SOL: empty() },

      deposit: (asset, q) => set((s) => {
        const qty = safeQty(q);
        if (qty <= 0) return s;
        const b = s.balances[asset] ?? empty();
        return { balances: { ...s.balances, [asset]: { ...b, wallet: (b.wallet ?? 0) + qty } } };
      }),

      stake: (asset, q) => set((s) => {
        const qty = safeQty(q);
        const b = s.balances[asset] ?? empty();
        if (qty <= 0 || (b.wallet ?? 0) < qty) return s;
        return { balances: { ...s.balances, [asset]: { ...b, wallet: b.wallet - qty, staked: (b.staked ?? 0) + qty } } };
      }),

      unstake: (asset, q) => set((s) => {
        const qty = safeQty(q);
        const b = s.balances[asset] ?? empty();
        if (qty <= 0 || (b.staked ?? 0) < qty) return s;
        return { balances: { ...s.balances, [asset]: { ...b, staked: b.staked - qty, wallet: (b.wallet ?? 0) + qty } } };
      }),

      supply: (asset, q) => set((s) => {
        const qty = safeQty(q);
        const b = s.balances[asset] ?? empty();
        if (qty <= 0 || (b.wallet ?? 0) < qty) return s;
        return { balances: { ...s.balances, [asset]: { ...b, wallet: b.wallet - qty, collateral: (b.collateral ?? 0) + qty } } };
      }),

      withdraw: (asset, q) => set((s) => {
        const qty = safeQty(q);
        const b = s.balances[asset] ?? empty();
        if (qty <= 0 || (b.collateral ?? 0) < qty) return s;
        return { balances: { ...s.balances, [asset]: { ...b, collateral: b.collateral - qty, wallet: (b.wallet ?? 0) + qty } } };
      }),

      borrow: (asset, q) => set((s) => {
        const qty = safeQty(q);
        const b = s.balances[asset] ?? empty();
        if (qty <= 0 || (b.collateral ?? 0) <= 0) return s;
        return { balances: { ...s.balances, [asset]: { ...b, debt: (b.debt ?? 0) + qty, wallet: (b.wallet ?? 0) + qty } } };
      }),

      repay: (asset, q) => set((s) => {
        const qty = safeQty(q);
        const b = s.balances[asset] ?? empty();
        const pay = Math.min(qty, b.wallet ?? 0, b.debt ?? 0);
        if (pay <= 0) return s;
        return { balances: { ...s.balances, [asset]: { ...b, wallet: b.wallet - pay, debt: b.debt - pay } } };
      }),

      reset: () => set({ balances: { BTC: empty(), ETH: empty(), SOL: empty() } }),
    }),
    { name: 'cyborg-terminal-balances-v1' },
  ),
);

// Selector helper with null-safe fallback
export function selectBalances(state: CyborgTerminalState, asset: CyborgAsset): AssetBalances {
  return state.balances?.[asset] ?? empty();
}

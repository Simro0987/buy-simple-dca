import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { dissolvedValue, type SupplyPosition } from '@/lib/leverageEngine';

type Asset = 'BTC' | 'ETH';
type Mode = 'build' | 'unwind';
interface Operations {
  modes: Record<Asset, Mode>;
  positions: Partial<Record<Asset, SupplyPosition>>;
  recovered: Record<Asset, number>;
  automationOff: Record<Asset, boolean>;
  setMode: (asset: Asset, mode: Mode) => void;
  deploy: (asset: Asset, position: SupplyPosition) => boolean;
  dissolve: (asset: Asset, price: number | undefined, reported?: SupplyPosition) => boolean;
  consume: (asset: Asset, amount: number) => boolean;
  confirmAutomation: (asset: Asset, off: boolean) => void;
}

/** Advisory recorded positions only, isolated per asset; no wallet transactions. */
export const useStakeOperationsStore = create<Operations>()(persist((set, get) => ({
  modes: { BTC: 'build', ETH: 'build' }, positions: {}, recovered: { BTC: 0, ETH: 0 }, automationOff: { BTC: false, ETH: false },
  setMode: (asset, mode) => set(s => ({ modes: { ...s.modes, [asset]: mode } })),
  deploy: (asset, position) => {
    if (get().positions[asset] || Object.values(position).some(v => !Number.isFinite(v) || v < 0)) return false;
    set(s => ({ positions: { ...s.positions, [asset]: position } }));
    return true;
  },
  dissolve: (asset, price, reported) => {
    const position = get().positions[asset] ?? reported;
    if (!position || Object.values(position).some(v => !Number.isFinite(v) || v < 0)) return false;
    const value = dissolvedValue(position, price);
    if (value == null || value <= 0) return false;
    set(s => ({ positions: { ...s.positions, [asset]: undefined }, recovered: { ...s.recovered, [asset]: s.recovered[asset] + value } }));
    return true;
  },
  consume: (asset, amount) => {
    if (!Number.isFinite(amount) || amount <= 0 || amount > get().recovered[asset] + 1e-9) return false;
    set(s => {
      const remaining = Math.max(0, s.recovered[asset] - amount);
      return { recovered: { ...s.recovered, [asset]: remaining < 1e-9 ? 0 : remaining } };
    });
    return true;
  },
  confirmAutomation: (asset, off) => set(s => ({ automationOff: { ...s.automationOff, [asset]: off } })),
}), { name: 'stake-two-way-operations-v1' }));
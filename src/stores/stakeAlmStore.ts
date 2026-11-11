import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AlmConfig { autoRepay: boolean; autoBoost: boolean }
type Asset = 'BTC' | 'ETH';
interface AlmStore {
  configs: Record<Asset, AlmConfig>;
  configure: (asset: Asset, key: keyof AlmConfig, enabled: boolean) => void;
}

/** Local ALM plans only; no local selection claims to enable a chain transaction. */
export const useStakeAlmStore = create<AlmStore>()(persist((set) => ({
  configs: { BTC: { autoRepay: true, autoBoost: true }, ETH: { autoRepay: true, autoBoost: true } },
  configure: (asset, key, enabled) => set(s => ({ configs: {
    ...s.configs, [asset]: { ...s.configs[asset], [key]: enabled },
  } })),
}), { name: 'stake-alm-plans-v1' }));
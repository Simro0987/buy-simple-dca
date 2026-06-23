import {
  createContext, useContext, useEffect, useMemo, useState, type ReactNode,
} from 'react';
import { getLiveApyMap } from '@/lib/stakeRoutingService';

/** APYs shared by Staking Splits (top) and Cyborg Terminal (bottom). */
export interface StakingSplitApys {
  rEth: number;
  weEth: number;
  mSol: number;
  inf: number;
  tick: number;
}

const TICK_MS = 18_000;

const Ctx = createContext<StakingSplitApys | null>(null);

export function StakingApyProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const value = useMemo<StakingSplitApys>(() => {
    const map = getLiveApyMap(tick);
    return {
      rEth: map.ethRocketPool,
      weEth: map.ethEtherfi,
      mSol: map.solMarinadeNative,
      inf: map.solSanctumInf,
      tick,
    };
  }, [tick]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStakingSplitApys(): StakingSplitApys {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStakingSplitApys must be used inside StakingApyProvider');
  return v;
}

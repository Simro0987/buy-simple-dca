/**
 * useStakingAccrual — simulácia denného staking výnosu.
 *
 * Pre každé aktívum, ktoré je v stave „Staked“, prepočíta narastajúci objem
 * tokenov z live APY (Lido pre ETH, Helius pre SOL, inak APY zo záznamu)
 * podľa času od potvrdenia stakingu. Hodnota sa prepočítava každú minútu,
 * takže výnos v portfóliu vizuálne rastie priebežne.
 *
 * accrued = amount × (APY/100) × (uplynulý čas / 1 rok)
 */
import { useEffect, useMemo, useState } from 'react';
import { useActiveStakes } from '@/stores/activeStakingStore';
import { useSolStakingApy, useLidoApr, SOL_APY_FALLBACK, LIDO_APR_FALLBACK } from '@/hooks/useStakingApr';

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const TICK_MS = 60_000;

export interface AccrualInfo {
  /** Vážené APY použité na simuláciu (%) */
  apy: number;
  /** Narastený výnos v tokenoch od potvrdenia stakingu */
  accruedQty: number;
  /** Denný prírastok v tokenoch */
  dailyQty: number;
  /** Stakované množstvo, z ktorého sa výnos počíta */
  stakedQty: number;
}

export type AccrualMap = Record<string, AccrualInfo>;

export function useStakingAccrual(): AccrualMap {
  const { records } = useActiveStakes();
  const { data: sol } = useSolStakingApy();
  const { data: lido } = useLidoApr();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(id);
  }, []);

  const solApy = sol?.apy ?? SOL_APY_FALLBACK;
  const ethApr = lido?.apr ?? LIDO_APR_FALLBACK;

  return useMemo(() => {
    const out: AccrualMap = {};
    for (const r of records) {
      if ((r.kind ?? 'staked') !== 'staked') continue;
      if (!(r.amount > 0)) continue;
      const sym = r.symbol.toUpperCase();
      const fallback = sym === 'SOL' ? solApy : sym === 'ETH' ? ethApr : 0;
      const apy = Number(r.apy) > 0 ? Number(r.apy) : fallback;
      if (!(apy > 0)) continue;
      const elapsed = Math.max(0, now - r.ts);
      const accrued = r.amount * (apy / 100) * (elapsed / YEAR_MS);
      const daily = r.amount * (apy / 100) * (DAY_MS / YEAR_MS);
      const prev = out[sym];
      if (prev) {
        const totalStaked = prev.stakedQty + r.amount;
        out[sym] = {
          apy: (prev.apy * prev.stakedQty + apy * r.amount) / (totalStaked || 1),
          accruedQty: prev.accruedQty + accrued,
          dailyQty: prev.dailyQty + daily,
          stakedQty: totalStaked,
        };
      } else {
        out[sym] = { apy, accruedQty: accrued, dailyQty: daily, stakedQty: r.amount };
      }
    }
    return out;
  }, [records, now, solApy, ethApr]);
}

export function accrualFor(map: AccrualMap, symbol: string): AccrualInfo | undefined {
  return map[symbol.toUpperCase()];
}

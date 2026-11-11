import { useMemo } from 'react';
import { useBtcDailyIndicators } from './useBtcDailyIndicators';
import { useEthDailyIndicators } from './useEthDailyIndicators';
import { useSolDailyIndicators } from './useSolDailyIndicators';
import { useHypeDailyIndicators } from './useHypeDailyIndicators';
import { useTokenDailyIndicators } from './useTokenDailyIndicators';
import {
  applyBrakeBoost,
  evaluateBrakeBoost,
  type BrakeBoostResult,
  type BrakeBoostState,
  type BrakeBoostToken,
  type TokenIndicators,
  type ProxyPoolInput,
} from '@/lib/safetyBrakeBoost';

/** MKT/LMT alokácie z Capital Pipeline (USD) pre jednotlivé tokeny. */
export type BrakeBoostAllocations = Partial<Record<BrakeBoostToken, { marketUsd: number; limitUsd: number }>>;

export interface UseSafetyBrakeBoostResult {
  /** Vyhodnotené režimy pre všetky tokeny (aj bez alokácie). */
  states: Record<BrakeBoostToken, BrakeBoostState>;
  /** Prepočítané MKT alokácie + capital flow do BTC. Null ak neboli dodané alokácie. */
  result: BrakeBoostResult | null;
  /** Čítanie indikátorov ešte prebieha. */
  isLoading: boolean;
  indicators: Record<BrakeBoostToken, TokenIndicators | null>;
}

const TOKENS: BrakeBoostToken[] = ['btc', 'eth', 'sol', 'link', 'aave', 'hype'];

/** 200D MA fallback → 50D EMA (nové tokeny nemajú 200 denných sviečok). */
const toInd = (
  d: { price: number; sma200?: number | null; ema50?: number | null; rsi14: number } | undefined,
): TokenIndicators | null => {
  if (!d || !(d.price > 0)) return null;
  const ma = Number(d.sma200) > 0 ? Number(d.sma200) : Number(d.ema50) > 0 ? Number(d.ema50) : 0;
  if (!(ma > 0)) return null;
  return { price: d.price, ma200: ma, rsi14: Number.isFinite(d.rsi14) ? d.rsi14 : 50 };
};

/**
 * Safety Active Brake & Boost — state layer.
 * Vyhodnotí režim (STOP/REDUCE/NORMAL/BOOST/DEEP_BOOST) pre každý token
 * a voliteľne prepočíta MKT alokácie vrátane presunu alt kapitálu do BTC.
 * LMT alokácie zostávajú nezmenené.
 */
export function useSafetyBrakeBoost(allocations?: BrakeBoostAllocations, proxy?: ProxyPoolInput): UseSafetyBrakeBoostResult {
  const btc = useBtcDailyIndicators();
  const eth = useEthDailyIndicators();
  const sol = useSolDailyIndicators();
  const hype = useHypeDailyIndicators();
  const link = useTokenDailyIndicators('LINK');
  const aave = useTokenDailyIndicators('AAVE');

  const indicators = useMemo<Record<BrakeBoostToken, TokenIndicators | null>>(() => ({
    btc: toInd(btc.data),
    eth: toInd(eth.data),
    sol: toInd(sol.data),
    link: toInd(link.data),
    aave: toInd(aave.data),
    hype: toInd(hype.data),
  }), [btc.data, eth.data, sol.data, link.data, aave.data, hype.data]);

  const states = useMemo(() => {
    const out = {} as Record<BrakeBoostToken, BrakeBoostState>;
    for (const t of TOKENS) out[t] = evaluateBrakeBoost(t, indicators[t]);
    return out;
  }, [indicators]);

  const result = useMemo(() => {
    if (!allocations) return null;
    const inputs = TOKENS
      .filter(t => allocations[t] !== undefined)
      .map(t => ({
        token: t,
        marketUsd: allocations[t]!.marketUsd,
        limitUsd: allocations[t]!.limitUsd,
        indicators: indicators[t],
      }));
    if (inputs.length === 0) return null;
    return applyBrakeBoost(inputs, proxy);
  }, [allocations, indicators, proxy?.freedUsd, proxy?.boostUsd]);

  return {
    states,
    result,
    isLoading: btc.isLoading || eth.isLoading || sol.isLoading || link.isLoading || aave.isLoading || hype.isLoading,
    indicators,
  };
}

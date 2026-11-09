import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useSafetyBrakeBoost } from './useSafetyBrakeBoost';
import { useTokenDailyIndicators, tokenDailyIndicatorsQuery } from './useTokenDailyIndicators';
import {
  allocateCoreSatellite,
  SATELLITE_LABEL,
  SATELLITE_TOKENS,
  type CoreSatelliteAllocationResult,
  type SatelliteIndicators,
  type SatelliteToken,
  type MacroBasketWeights,
} from '@/lib/satelliteAllocation';
import type { DynamicSatellite } from './useDynamicSatellites';
import { basketOf } from '@/lib/assetBaskets';
import { satelliteSieve, highBetaSieve, proxySieve } from '@/lib/dcaBasketEngine';
import { useMstrMnav, MSTR_CLEAN_SHEET } from '@/lib/mstrFundamentals';
import { useBtc200wSma } from './useBtc200wSma';
import { useTokenomics } from './useTokenomics';

export interface UseSatelliteAllocationResult extends CoreSatelliteAllocationResult {
  indicators: Partial<Record<SatelliteToken, SatelliteIndicators | null>>;
  isLoading: boolean;
}

/**
 * Jednotná CORE (BTC ≥ 50 %) / SATELLITES alokácia.
 * Satelitný kôš (ETH, SOL, LINK, AAVE, HYPE + dynamicky pridané
 * tokeny z Portfólia) sa delí proporčne podľa relatívneho dynamického skóre
 * z RSI / 200D MA / momenta.
 */
export function useSatelliteAllocation(
  investableUsd: number,
  requestedBtcPct = 50,
  btcOnly = false,
  extras: DynamicSatellite[] = [],
  /** Aktívne built-in satelity — odstránené tokeny sa vylúčia z koša. */
  baseTokens: SatelliteToken[] = SATELLITE_TOKENS,
  macroBasketWeights?: MacroBasketWeights,
): UseSatelliteAllocationResult {
  const { indicators: brakeInd, isLoading } = useSafetyBrakeBoost();
  const btcW = useBtc200wSma();
  const btcD = useTokenDailyIndicators('BTC');
  const tokenomics = useTokenomics();
  const mnavQ = useMstrMnav();
  const mstrMnav = mnavQ.data?.mnav ?? null;
  const mstrKey = `${mstrMnav}:${mnavQ.isLoading}`;
  const tokKey = JSON.stringify(tokenomics.data ?? null) + String(tokenomics.isLoading);
  const btcKey = `${btcW.data?.price ?? 0}:${btcW.data?.sma200w ?? 0}:${btcW.isError}:${btcD.data?.ema50 ?? 0}:${btcD.data?.price ?? 0}:${btcD.data?.change7dPct ?? 0}:${btcD.data?.rsiWeekly ?? 0}`;
  // 50D EMA fallback za 200D MA
  const eth = useTokenDailyIndicators('ETH');
  const sol = useTokenDailyIndicators('SOL');
  const link = useTokenDailyIndicators('LINK');
  const aave = useTokenDailyIndicators('AAVE');

  // Dynamické satelity — indikátory pre premenlivý počet tokenov.
  const extraQueries = useQueries({
    queries: extras.map((e) => ({
      ...tokenDailyIndicatorsQuery(e.symbol, e.cgId),
      enabled: !btcOnly && !!e.symbol,
    })),
  });

  const emaBySymbol: Partial<Record<SatelliteToken, number>> = {
    eth: eth.data?.ema50,
    sol: sol.data?.ema50,
    link: link.data?.ema50,
    aave: aave.data?.ema50,
  };

  const emaKey = SATELLITE_TOKENS.map((t) => Number(emaBySymbol[t]) || 0).join('|');
  const extraKey = extras
    .map((e, i) => {
      const d = extraQueries[i]?.data;
      return `${e.key}:${Number(d?.price) || 0}:${Number(d?.rsi14) || 0}:${Number(d?.sma200) || 0}:${Number(d?.change24hPct) || 0}:${Number(d?.change30dPct) || 0}:${Number(d?.volume24h) || 0}`;
    })
    .join('|');

  const baseKey = baseTokens.join('|');
  const tokens = useMemo(
    () => [...baseTokens, ...extras.map((e) => e.key)],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [baseKey, extras.map((e) => e.key).join('|')],
  );

  const labels = useMemo(() => {
    const out: Record<string, string> = { ...SATELLITE_LABEL };
    for (const e of extras) out[e.key] = e.symbol;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extras.map((e) => `${e.key}=${e.symbol}`).join('|')]);

  return useMemo(() => {
    // BTC-ONLY override: 100 % kapitálu do BTC, satelitný kôš = presne $0.
    // S² percentuálna matematika sa obchádza (short-circuit) — žiadne delenie nulou.
    if (btcOnly) {
      const capital = Math.max(0, Number(investableUsd) || 0);
      const satelliteList = tokens.map((token) => ({
        token,
        label: labels[token] ?? token.toUpperCase(),
        score: 0,
        weight: 0,
        usd: 0,
        maFallback: false,
        basket: basketOf(labels[token] ?? token) ?? 'SATELLITES',
        status: 'approved' as const,
        redirectedWeight: 0,
        redirectedUsd: 0,
        rsi: 50,
        overheat: 50,
        change24hPct: 0,
        baselineUsd: 0,
      }));
      const bySatellite = {} as Record<SatelliteToken, (typeof satelliteList)[number]>;
      for (const a of satelliteList) bySatellite[a.token] = a;
      return {
        btcUsd: Math.round(capital * 100) / 100,
        btcPct: 100,
        satelliteUsd: 0,
        satelliteList,
        bySatellite,
        totalScore: 0,
        cascade: { highBetaToSatellitesUsd: 0, satellitesToCoreUsd: 0, proxyToCoreUsd: 0, proxyReduceToCoreUsd: 0, proxyBoostReserveUsd: 0 },
        approvedCount: { CORE: 0, SATELLITES: 0, HIGH_BETA: 0, PROXY: 0 },
        basketUsd: { CORE: capital, SATELLITES: 0, HIGH_BETA: 0, PROXY: 0 },
        indicators: {},
        isLoading: false,
      };
    }
    const indicators: Partial<Record<SatelliteToken, SatelliteIndicators | null>> = {};
    for (const t of baseTokens) {
      const bb = brakeInd?.[t] ?? null;
      indicators[t] = bb
        ? { price: bb.price, ma200: bb.ma200, rsi14: bb.rsi14, ema50: emaBySymbol[t] }
        : (emaBySymbol[t] ? { ema50: emaBySymbol[t] } : null);
    }
    extras.forEach((e, i) => {
      const d = extraQueries[i]?.data;
      const storageKey = `dca-falling-knife-${e.symbol.toUpperCase()}`;
      const wasStopped = typeof window !== 'undefined' && localStorage.getItem(storageKey) === '1';
      const fallingKnife = d
        ? (wasStopped ? d.rsi14 <= 25 : d.rsi14 < 15 && d.price < d.sma200)
        : wasStopped;
      if (typeof window !== 'undefined') {
        if (fallingKnife) localStorage.setItem(storageKey, '1');
        else localStorage.removeItem(storageKey);
      }
      const sieve = e.basket === 'SATELLITES'
        ? satelliteSieve({
            btcPrice: btcW.data?.price ?? null,
            btc200w: btcW.data?.sma200w ?? null,
            btcError: btcW.isError && !btcW.data,
            rsi: d && d.source !== 'fallback' ? d.rsi14 : null,
            growthPct: d && d.source !== 'fallback' ? d.change30dPct : null,
          })
        : e.basket === 'HIGH_BETA'
        ? (() => {
            const real = d && d.source !== 'fallback' ? d : null;
            return highBetaSieve({
              symbol: e.symbol,
              btcPrice: btcD.data?.price ?? btcW.data?.price ?? null,
              btc200w: btcW.data?.sma200w ?? null,
              btcEma50: btcD.data && btcD.data.source !== 'fallback' ? btcD.data.ema50 : null,
              btcError: (btcW.isError && !btcW.data) || (btcD.isError && !btcD.data),
              price: real?.price ?? null, ema50: real?.ema50 ?? null, swingLow: real?.swingLow ?? null,
              change24hPct: real?.change24hPct ?? null, growthPct: real?.change30dPct ?? null,
              rsi: real?.rsi14 ?? null, rsiWeekly: real?.rsiWeekly ?? null,
              volume24h: real?.volume24h ?? null, volumeAvg20: real?.volumeAvg20 ?? null,
              unlock: tokenomics.data?.[e.symbol.toUpperCase()]?.unlock ?? null,
              supplyChange7dPct: tokenomics.data?.[e.symbol.toUpperCase()]?.supplyChange7dPct ?? null,
              tokenomicsLoading: tokenomics.isLoading,
            });
          })()
        : e.basket === 'PROXY'
        ? (() => {
            const real = d && d.source !== 'fallback' ? d : null;
            const bd = btcD.data && btcD.data.source !== 'fallback' ? btcD.data : null;
            return proxySieve({
              btcPrice: bd?.price ?? btcW.data?.price ?? null,
              btc200w: btcW.data?.sma200w ?? null,
              btcEma50: bd?.ema50 ?? null,
              btcChange7dPct: bd?.change7dPct ?? null,
              btcRsiWeekly: bd?.rsiWeekly ?? null,
              btcError: (btcW.isError && !btcW.data) || (btcD.isError && !btcD.data),
              mnav: mstrMnav, mnavLoading: mnavQ.isLoading, cleanSheet: MSTR_CLEAN_SHEET,
              price: real?.price ?? null, ema50: real?.ema50 ?? null, sma200: real?.sma200 ?? null,
              bbLower: real?.bbLower ?? null, low7d: real?.low7d ?? null,
              growthPct: real?.change30dPct ?? null, rsiWeekly: real?.rsiWeekly ?? null,
            });
          })()
        : undefined;
      indicators[e.key] = d
        ? { price: d.price, ma200: Number(d.sma200) > 0 ? d.sma200 : d.ema50, rsi14: d.rsi14, ema50: d.ema50, change24hPct: d.change24hPct, fallingKnife, sieve }
        : (sieve ? { sieve } : null);
    });
    return {
      ...allocateCoreSatellite(investableUsd, requestedBtcPct, indicators, tokens, labels, macroBasketWeights),
      indicators,
      isLoading,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [investableUsd, requestedBtcPct, btcOnly, brakeInd, emaKey, extraKey, isLoading, tokens, labels, baseKey, macroBasketWeights, btcKey, tokKey, mstrKey]);
}

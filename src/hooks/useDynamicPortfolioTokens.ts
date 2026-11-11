/**
 * useDynamicPortfolioTokens — plnohodnotné karty pre KAŽDÝ token v Portfóliu.
 *
 * Tokeny, ktoré nemajú hardkódovaný Harvest profil (t.j. všetko okrem
 * BTC/ETH/SOL/HYPE/AAVE/LINK), dostanú po pridaní do Portfólia (manuálne
 * alebo synchronizáciou z DCA) okamžite kompletnú kartu:
 *  · živá cena, podiel v portfóliu, overheat teplomer
 *  · nerealizované PnL (cenový pohyb vs staking výnos), WACB, vložený kapitál
 *  · Harvest engine: 10-faktorové skóre, TP odporúčanie, smerovanie, log výberu
 *
 * Realizované zisky sa čítajú z DB (`useRealizedProfit`) — teda každý token
 * bez výnimky prispieva do globálnej metriky „Vybrané zisky“, aj po odstránení.
 */
import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { useTrackedTokens } from '@/hooks/useTrackedTokens';
import { useHiddenTokens } from '@/lib/hiddenPortfolioTokens';
import { tokenDailyIndicatorsQuery, type TokenDailyIndicators } from '@/hooks/useTokenDailyIndicators';
import { useAvgBuyPrices } from '@/hooks/useAvgBuyPrices';
import { useAssetLayers, layerFor, splitLayers } from '@/hooks/useAssetLayers';
import { useStakingYieldQty, splitPnl } from '@/hooks/useStakingYield';
import { HARVEST_TOKENS, computeHarvest, type HarvestToken, type HarvestVerdict } from '@/lib/harvestEngine';
import type { PortfolioAsset } from '@/hooks/usePortfolioAssets';
import { BASKET_ASSETS, type Basket } from '@/lib/assetBaskets';

/** Tokeny, ktoré už majú vlastnú kartu inde (Core BTC / stablecoiny / zisky). */
const EXCLUDED = new Set<string>([
  ...HARVEST_TOKENS,
  'WBTC', 'USDC', 'USDT', 'DAI', 'PAXG',
]);

export interface DynamicTokenCard {
  asset: PortfolioAsset;
  verdict?: HarvestVerdict;
  source: TokenDailyIndicators['source'] | 'none';
  basket: Basket;
}

export interface DynamicPortfolioTokensState {
  cards: DynamicTokenCard[];
  totalFiatValue: number;
  totalInvestedCapital: number;
  totalPnlUsd: number;
  totalPriceActionUsd: number;
  totalStakingYieldUsd: number;
  totalStakedValueUsd: number;
  isLoading: boolean;
}

export function useDynamicPortfolioTokens(opts: {
  fearGreed: number;
  btcSmaDistPct?: number;
  btcChange30dPct?: number;
  /** Základ pre výpočet podielu v portfóliu (celková hodnota vrátane Core). */
  portfolioTotalUsd?: number;
}): DynamicPortfolioTokensState {
  const { data: tracked, isLoading: trackedLoading } = useTrackedTokens();
  const hidden = useHiddenTokens();
  const { data: avg } = useAvgBuyPrices();
  const layers = useAssetLayers();
  const { data: yieldQty } = useStakingYieldQty();

  const tokens = useMemo(() => {
    // Iba tokeny zo 4 košov; chýbajúce začínajú so zostatkom 0.
    void tracked;
    const out: Array<{ symbol: string; cgId: string; basket: Basket }> = [];
    for (const a of BASKET_ASSETS) {
      if (EXCLUDED.has(a.symbol)) continue;
      if ((a.cgId && hidden.includes(a.cgId)) || hidden.includes(a.symbol)) continue;
      out.push({ symbol: a.symbol, cgId: a.cgId, basket: a.basket });
    }
    return out;
  }, [tracked, hidden]);

  const results = useQueries({
    queries: tokens.map(t => tokenDailyIndicatorsQuery(t.symbol, t.cgId)),
  });

  const dataKey = results.map(r => Number(r.data?.price) || 0).join('|');
  const anyLoading = results.some(r => r.isLoading);

  return useMemo(() => {
    const base = opts.portfolioTotalUsd ?? 0;
    const cards: DynamicTokenCard[] = tokens.map((t, idx) => {
      const ind = results[idx]?.data;
      const price = Number(ind?.price) || 0;
      const cost = avg?.[t.symbol];
      const l = layerFor(layers, t.symbol);
      const ls = splitLayers(Number(cost?.qty) || 0, l, price);
      const stakedQty = ls.staked;
      const qty = ls.total;
      const wacb = Number(cost?.avgPrice) || 0;
      const investedCapital = qty > 0 && wacb > 0 ? qty * wacb : 0;
      const currentFiatValue = qty * price;
      const pnlUsd = investedCapital > 0 && price > 0 ? currentFiatValue - investedCapital : 0;
      const pnlPct = investedCapital > 0 && price > 0 ? (pnlUsd / investedCapital) * 100 : null;
      const yUsd = (Number(yieldQty?.[t.symbol]) || 0) * price;
      const split = splitPnl(pnlUsd, yUsd);

      let verdict: HarvestVerdict | undefined;
      if (ind && price > 0) {
        const emaDist = ind.ema50 > 0 ? ((price - ind.ema50) / ind.ema50) * 100 : 0;
        verdict = computeHarvest({
          token: t.symbol as HarvestToken,
          price,
          rsi14: ind.rsi14,
          sma200: ind.sma200,
          ema50: ind.ema50,
          smaDistPct: ind.smaDistPct,
          atrPct: price > 0 ? (ind.atr14 / price) * 100 : 0,
          change30dPct: emaDist,
          change90dPct: ind.smaDistPct,
          btcChange30dPct: opts.btcChange30dPct ?? 0,
          btcSmaDistPct: opts.btcSmaDistPct ?? 0,
          volumeTrend: 1,
          drawdownPct: ind.swingHigh > 0 ? ((price - ind.swingHigh) / ind.swingHigh) * 100 : 0,
          fearGreed: opts.fearGreed,
          degraded: ind.source === 'fallback',
          historyDays: ind.candleCount,
          fundamentals: null,
          unrealizedPnlPct: pnlPct,
        });
      }

      const asset: PortfolioAsset = {
        assetSymbol: t.symbol as HarvestToken,
        tokenQuantity: qty,
        investedCapital,
        currentFiatValue,
        tokenPrice: price,
        realPnL: pnlPct,
        realPnLUsd: pnlUsd,
        weight: base > 0 ? currentFiatValue / base : 0,
        wacb,
        overheatScore: Number(verdict?.overheat ?? 0),
        tpPct: Number(verdict?.tpPct ?? 0),
        liquidQty: ls.liquid,
        stakedQty,
        stakedValueUsd: stakedQty * price,
        collateralQty: ls.collateral,
        borrowQty: ls.borrowQty,
        borrowUsd: l.borrowUsd + l.borrowNative * price,
        priceActionUsd: split.priceActionUsd,
        stakingYieldUsd: split.yieldUsd,
        manualLayerOverride: ls.manualOverride,
      };

      return { asset, verdict, source: ind?.source ?? 'none', basket: t.basket };
    });

    const sum = (fn: (c: DynamicTokenCard) => number) => cards.reduce((s, c) => s + fn(c), 0);

    return {
      cards,
      totalFiatValue: sum(c => c.asset.currentFiatValue),
      totalInvestedCapital: sum(c => c.asset.investedCapital),
      totalPnlUsd: sum(c => c.asset.realPnLUsd),
      totalPriceActionUsd: sum(c => c.asset.priceActionUsd),
      totalStakingYieldUsd: sum(c => c.asset.stakingYieldUsd),
      totalStakedValueUsd: sum(c => c.asset.stakedValueUsd),
      isLoading: trackedLoading || anyLoading,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokens, dataKey, anyLoading, trackedLoading, avg, layers, yieldQty,
      opts.fearGreed, opts.btcSmaDistPct, opts.btcChange30dPct, opts.portfolioTotalUsd]);
}

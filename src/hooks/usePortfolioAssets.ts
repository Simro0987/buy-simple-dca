/**
 * usePortfolioAssets — jediný reaktívny model portfólia pre UI.
 *
 * Pre každé aktívum vracia: assetSymbol, tokenQuantity, investedCapital,
 * currentFiatValue, tokenPrice, realPnL (%) a overheatScore (0–100).
 * Zároveň publikuje BTC overheat skóre do globálneho stavu (`btcOverheat`).
 */
import { useEffect, useMemo } from 'react';
import { useFearGreed } from '@/hooks/usePrices';
import { useHarvestScores } from '@/hooks/useHarvestScores';
import { useLivePortfolioPrices, mergePrices } from '@/hooks/useLivePortfolioPrices';
import { useEffectiveHoldings } from '@/hooks/useEffectiveHoldings';
import { computePortfolioPnl } from '@/lib/portfolioHoldings';
import { HARVEST_TOKENS, type HarvestToken } from '@/lib/harvestEngine';
import { setBtcOverheatScore } from '@/lib/btcOverheat';
import { useAssetLayers, layerFor, splitLayers } from '@/hooks/useAssetLayers';
import { useStakingYieldQty, splitPnl } from '@/hooks/useStakingYield';

export interface PortfolioAsset {
  assetSymbol: HarvestToken;
  /** Čistý zostatok = (liquid + staked + collateral) − borrow. */
  tokenQuantity: number;
  investedCapital: number;
  currentFiatValue: number;
  tokenPrice: number;
  /** Nerealizované PnL v %, null keď nie je zadaný WACB / množstvo. */
  realPnL: number | null;
  realPnLUsd: number;
  /** Podiel v portfóliu 0..1. */
  weight: number;
  wacb: number;
  overheatScore: number;
  tpPct: number;
  /** Vnorené stavy aktíva (v tokenoch). */
  liquidQty: number;
  /** Stakované množstvo (Stake modul) — stále súčasť hodnoty portfólia. */
  stakedQty: number;
  stakedValueUsd: number;
  collateralQty: number;
  borrowQty: number;
  borrowUsd: number;
  /** Rozklad nerealizovaného PnL. */
  priceActionUsd: number;
  stakingYieldUsd: number;
  manualLayerOverride: boolean;
}

export interface PortfolioAssetsState {
  assets: PortfolioAsset[];
  byToken: Record<HarvestToken, PortfolioAsset>;
  prices: Partial<Record<HarvestToken, number>>;
  totalFiatValue: number;
  totalInvestedCapital: number;
  totalPnlUsd: number;
  totalPnlPct: number | null;
  totalStakedValueUsd: number;
  totalPriceActionUsd: number;
  totalStakingYieldUsd: number;
  btcOverheatScore: number;
  configuredCount: number;
  isLoading: boolean;
}

export function usePortfolioAssets(): PortfolioAssetsState {
  const { data: fg } = useFearGreed();
  const { data, isLoading } = useHarvestScores(fg?.value ?? 50);
  const { data: livePrices } = useLivePortfolioPrices();
  const layers = useAssetLayers();
  const { data: yieldQty } = useStakingYieldQty();

  const prices = mergePrices(
    (data?.prices ?? {}) as Record<HarvestToken, number>,
    livePrices,
  );
  const holdings = useEffectiveHoldings(prices);

  const priceKey = HARVEST_TOKENS.map((t) => Number(prices[t]) || 0).join('|');

  const state = useMemo<PortfolioAssetsState>(() => {
    const pnl = computePortfolioPnl(holdings, prices);
    const byToken = {} as Record<HarvestToken, PortfolioAsset>;

    const assets: PortfolioAsset[] = pnl.positions.map((p) => {
      const verdict = data?.verdicts?.[p.token];
      const l = layerFor(layers, p.token);
      // p.qty je už čistý zostatok (gross − borrow) → hrubý = qty + borrow.
      const borrowQty = l.borrowNative + (p.price > 0 ? l.borrowUsd / p.price : 0);
      const ls = splitLayers(p.qty + borrowQty, l, p.price);
      const yUsd = (Number(yieldQty?.[p.token]) || 0) * p.price;
      const split = splitPnl(p.pnlUsd, yUsd);
      const asset: PortfolioAsset = {
        assetSymbol: p.token,
        tokenQuantity: p.qty,
        investedCapital: p.costUsd,
        currentFiatValue: p.valueUsd,
        tokenPrice: p.price,
        realPnL: p.pnlPct,
        realPnLUsd: p.pnlUsd,
        weight: p.weight,
        wacb: p.wacb,
        overheatScore: Number(verdict?.overheat ?? 0),
        tpPct: Number(verdict?.tpPct ?? 0),
        liquidQty: ls.liquid,
        stakedQty: ls.staked,
        stakedValueUsd: ls.staked * p.price,
        collateralQty: ls.collateral,
        borrowQty: ls.borrowQty,
        borrowUsd: l.borrowUsd + l.borrowNative * p.price,
        priceActionUsd: split.priceActionUsd,
        stakingYieldUsd: split.yieldUsd,
        manualLayerOverride: ls.manualOverride,
      };
      byToken[p.token] = asset;
      return asset;
    });

    return {
      assets,
      byToken,
      prices,
      totalFiatValue: pnl.totalValueUsd,
      totalInvestedCapital: pnl.totalCostUsd,
      totalPnlUsd: pnl.pnlUsd,
      totalPnlPct: pnl.pnlPct,
      totalStakedValueUsd: assets.reduce((s2, a) => s2 + a.stakedValueUsd, 0),
      totalPriceActionUsd: assets.reduce((s2, a) => s2 + a.priceActionUsd, 0),
      totalStakingYieldUsd: assets.reduce((s2, a) => s2 + a.stakingYieldUsd, 0),
      btcOverheatScore: byToken.BTC?.overheatScore ?? 0,
      configuredCount: pnl.configuredCount,
      isLoading,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holdings, priceKey, data, isLoading, layers, yieldQty]);

  useEffect(() => {
    setBtcOverheatScore(state.btcOverheatScore);
  }, [state.btcOverheatScore]);

  return state;
}

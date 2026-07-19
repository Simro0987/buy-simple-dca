"use client";

import { useMemo } from "react";
import { useCryptoPrices } from "@/hooks/useCryptoPrices";
import { portfolioHoldings, type PortfolioAsset } from "@/lib/data";
import type { CryptoSymbol } from "@/lib/cryptoApi";

export interface LiveAsset extends PortfolioAsset {
  usdValue: number;
  change7d: number;
  unitPrice: number;
}

export function usePortfolio() {
  const { prices, loading, error, isLive, lastUpdated } = useCryptoPrices();

  const assets = useMemo<LiveAsset[]>(() => {
    return portfolioHoldings.assets.map((asset) => {
      const live = prices[asset.symbol as CryptoSymbol];
      const unitPrice = live?.price ?? 0;

      return {
        ...asset,
        unitPrice,
        usdValue: asset.balance * unitPrice,
        change7d: live?.change7d ?? 0,
      };
    });
  }, [prices]);

  const cryptoTotal = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.usdValue, 0),
    [assets],
  );

  const totalBalance = cryptoTotal + portfolioHoldings.cashUsd;

  return {
    assets,
    totalBalance,
    realizedDeposit: portfolioHoldings.realizedDeposit,
    profitLoss: portfolioHoldings.profitLoss,
    loading,
    error,
    isLive,
    lastUpdated,
    prices,
  };
}

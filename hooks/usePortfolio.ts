"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCryptoPrices } from "@/hooks/useCryptoPrices";
import type { PortfolioAsset } from "@/lib/data";
import type { CryptoSymbol } from "@/lib/cryptoApi";
import {
  ASSET_DEFINITIONS,
  DEFAULT_HOLDINGS,
  readHoldingsFromStorage,
  writeHoldingsToStorage,
  type HoldingsMap,
} from "@/lib/portfolioStorage";
import { portfolioHoldings } from "@/lib/data";

export interface LiveAsset extends PortfolioAsset {
  usdValue: number;
  change7d: number;
  unitPrice: number;
}

export function usePortfolio() {
  const { prices, loading, error, isLive, lastUpdated } = useCryptoPrices();
  const [holdings, setHoldings] = useState<HoldingsMap>(DEFAULT_HOLDINGS);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = readHoldingsFromStorage();
    if (stored) {
      setHoldings(stored);
    }
    setIsHydrated(true);
  }, []);

  const updateHoldings = useCallback((next: HoldingsMap) => {
    setHoldings(next);
    writeHoldingsToStorage(next);
  }, []);

  const assets = useMemo<LiveAsset[]>(() => {
    return ASSET_DEFINITIONS.map((definition) => {
      const live = prices[definition.symbol];
      const unitPrice = live?.price ?? 0;
      const balance = holdings[definition.symbol];

      return {
        ...definition,
        balance,
        unitPrice,
        usdValue: balance * unitPrice,
        change7d: live?.change7d ?? 0,
      };
    });
  }, [holdings, prices]);

  const cryptoTotal = useMemo(
    () => assets.reduce((sum, asset) => sum + asset.usdValue, 0),
    [assets],
  );

  const totalBalance = cryptoTotal + portfolioHoldings.cashUsd;

  return {
    assets,
    holdings,
    totalBalance,
    realizedDeposit: portfolioHoldings.realizedDeposit,
    profitLoss: portfolioHoldings.profitLoss,
    loading: loading || !isHydrated,
    error,
    isLive,
    lastUpdated,
    prices,
    isHydrated,
    updateHoldings,
  };
}

export type { HoldingsMap, CryptoSymbol };

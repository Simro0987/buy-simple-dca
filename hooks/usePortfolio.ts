"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCryptoPrices } from "@/hooks/useCryptoPrices";
import type { PortfolioAsset } from "@/lib/data";
import type { CryptoPricesMap, CryptoSymbol } from "@/lib/cryptoApi";
import type { TokenExecutionPlan } from "@/lib/dcaEngineConfig";
import {
  ASSET_DEFINITIONS,
  createTransactionId,
  DEFAULT_PORTFOLIO,
  readPortfolioFromStorage,
  writePortfolioToStorage,
  type HoldingsMap,
  type PortfolioData,
  type Transaction,
} from "@/lib/portfolioStorage";
import { portfolioHoldings } from "@/lib/data";

export interface LiveAsset extends PortfolioAsset {
  usdValue: number;
  change7d: number;
  unitPrice: number;
}

export function usePortfolio() {
  const { prices, loading, error, isLive, lastUpdated } = useCryptoPrices();
  const [holdings, setHoldings] = useState<HoldingsMap>(DEFAULT_PORTFOLIO.holdings);
  const [transactions, setTransactions] = useState<Transaction[]>(
    DEFAULT_PORTFOLIO.transactions,
  );
  const [isHydrated, setIsHydrated] = useState(false);

  const persistPortfolio = useCallback((data: PortfolioData) => {
    setHoldings(data.holdings);
    setTransactions(data.transactions);
    writePortfolioToStorage(data);
  }, []);

  useEffect(() => {
    const stored = readPortfolioFromStorage();
    if (stored) {
      setHoldings(stored.holdings);
      setTransactions(stored.transactions);
    }
    setIsHydrated(true);
  }, []);

  const updateHoldings = useCallback(
    (next: HoldingsMap) => {
      persistPortfolio({ holdings: next, transactions });
    },
    [persistPortfolio, transactions],
  );

  const importPortfolio = useCallback(
    (data: PortfolioData) => {
      persistPortfolio(data);
    },
    [persistPortfolio],
  );

  const recordDcaPurchase = useCallback(
    (plans: TokenExecutionPlan[], priceMap: CryptoPricesMap) => {
      const newTransactions: Transaction[] = [];
      const nextHoldings: HoldingsMap = { ...holdings };

      for (const plan of plans) {
        const unitPrice = priceMap[plan.symbol]?.price ?? 0;
        if (unitPrice <= 0 || plan.totalUsd <= 0) continue;

        const amount = plan.totalUsd / unitPrice;
        nextHoldings[plan.symbol] += amount;

        newTransactions.push({
          id: createTransactionId(),
          date: new Date().toISOString(),
          symbol: plan.symbol,
          amount,
          priceUsd: unitPrice,
          spentUsd: plan.totalUsd,
          type: "DCA",
        });
      }

      if (newTransactions.length === 0) return false;

      const nextTransactions = [...newTransactions, ...transactions];
      persistPortfolio({
        holdings: nextHoldings,
        transactions: nextTransactions,
      });

      return true;
    },
    [holdings, persistPortfolio, transactions],
  );

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
    transactions,
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
    importPortfolio,
    recordDcaPurchase,
    portfolioData: { holdings, transactions } satisfies PortfolioData,
  };
}

export type { HoldingsMap, CryptoSymbol, Transaction, PortfolioData };

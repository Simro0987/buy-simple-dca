"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchCryptoPrices,
  type CryptoPrice,
  type CryptoPricesMap,
  type CryptoSymbol,
} from "@/lib/cryptoApi";

const REFRESH_INTERVAL_MS = 60_000;

const EMPTY_PRICES: CryptoPricesMap = {
  BTC: { symbol: "BTC", coingeckoId: "bitcoin", price: 0, change7d: 0 },
  ETH: { symbol: "ETH", coingeckoId: "ethereum", price: 0, change7d: 0 },
  SOL: { symbol: "SOL", coingeckoId: "solana", price: 0, change7d: 0 },
};

export function useCryptoPrices() {
  const [prices, setPrices] = useState<CryptoPricesMap>(EMPTY_PRICES);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadPrices = useCallback(async () => {
    try {
      const nextPrices = await fetchCryptoPrices();
      setPrices(nextPrices);
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prices");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPrices();
    const interval = setInterval(() => {
      void loadPrices();
    }, REFRESH_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [loadPrices]);

  const getPrice = useCallback(
    (symbol: CryptoSymbol): CryptoPrice => prices[symbol],
    [prices],
  );

  return {
    prices,
    loading,
    error,
    isLive: !loading && !error,
    lastUpdated,
    getPrice,
    refresh: loadPrices,
  };
}

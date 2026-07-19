"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import type { CryptoPrice, CryptoPricesMap, CryptoSymbol } from "@/lib/cryptoApi";
import type { DynamicPricesMap } from "@/lib/cryptoApi";
import type { NormalizedTokenPrice } from "@/lib/price/types";
import { useAppStore } from "@/src/store/useAppStore";

const EMPTY_CORE: CryptoPricesMap = {
  BTC: { symbol: "BTC", coingeckoId: "bitcoin", price: 0, change7d: 0 },
  ETH: { symbol: "ETH", coingeckoId: "ethereum", price: 0, change7d: 0 },
  SOL: { symbol: "SOL", coingeckoId: "solana", price: 0, change7d: 0 },
};

interface PricesApiResponse {
  success: boolean;
  prices?: Record<string, NormalizedTokenPrice>;
  core?: Record<CryptoSymbol, NormalizedTokenPrice>;
  source?: string;
  degraded?: boolean;
  fetchedAt?: string;
  error?: string;
}

function toCryptoPrice(entry: NormalizedTokenPrice): CryptoPrice {
  return {
    symbol: entry.symbol,
    coingeckoId: entry.coingeckoId,
    price: entry.price,
    change7d: entry.change7d,
    image: entry.image,
  };
}

async function fetchPricesFromProxy(
  coingeckoIds?: string[],
  symbols?: string[],
): Promise<PricesApiResponse> {
  const params = new URLSearchParams();
  if (coingeckoIds?.length) {
    params.set("ids", coingeckoIds.join(","));
    if (symbols?.length) params.set("symbols", symbols.join(","));
  }
  const query = params.toString();
  const res = await fetch(`/api/prices${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });
  return res.json() as Promise<PricesApiResponse>;
}

export function useCryptoPrices() {
  const setApiStatus = useAppStore((s) => s.setApiStatus);

  const query = useQuery({
    queryKey: ["prices", "core"],
    queryFn: () => fetchPricesFromProxy(),
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!query.data) return;
    setApiStatus("prices", {
      source: (query.data.source as "coingecko" | "mobula" | "coinmarketcap") ?? "unknown",
      healthy: query.data.success && !query.data.degraded,
      degraded: Boolean(query.data.degraded),
      message: query.data.error ?? null,
      lastCheck: query.data.fetchedAt ?? new Date().toISOString(),
    });
  }, [query.data, setApiStatus]);

  const prices: CryptoPricesMap = query.data?.core
    ? {
        BTC: toCryptoPrice(query.data.core.BTC),
        ETH: toCryptoPrice(query.data.core.ETH),
        SOL: toCryptoPrice(query.data.core.SOL),
      }
    : EMPTY_CORE;

  return {
    prices,
    loading: query.isLoading,
    error: query.error instanceof Error ? query.error.message : null,
    isLive: query.isSuccess && !query.data?.degraded,
    lastUpdated: query.dataUpdatedAt ? new Date(query.dataUpdatedAt) : null,
    getPrice: (symbol: CryptoSymbol) => prices[symbol],
    refresh: () => void query.refetch(),
    source: query.data?.source,
    degraded: query.data?.degraded,
  };
}

export function usePortfolioPriceQuery(
  coingeckoIds: string[],
  symbols: string[],
) {
  const setApiStatus = useAppStore((s) => s.setApiStatus);
  const key = coingeckoIds.join(",");

  const query = useQuery({
    queryKey: ["prices", "portfolio", key],
    queryFn: () => fetchPricesFromProxy(coingeckoIds, symbols),
    enabled: coingeckoIds.length > 0,
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!query.data) return;
    setApiStatus("prices", {
      source: (query.data.source as "coingecko" | "mobula" | "coinmarketcap") ?? "unknown",
      healthy: query.data.success && !query.data.degraded,
      degraded: Boolean(query.data.degraded),
      message: query.data.error ?? null,
      lastCheck: query.data.fetchedAt ?? new Date().toISOString(),
    });
  }, [query.data, setApiStatus]);

  const dynamicPrices: DynamicPricesMap = {};
  if (query.data?.prices) {
    for (const [id, entry] of Object.entries(query.data.prices)) {
      dynamicPrices[id] = toCryptoPrice(entry);
    }
  }

  return {
    dynamicPrices,
    loading: query.isLoading,
    refresh: () => void query.refetch(),
    degraded: query.data?.degraded,
    source: query.data?.source,
  };
}

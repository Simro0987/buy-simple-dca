"use client";

import { useCallback, useEffect, useState } from "react";
import {
  OCTAGON_TOKEN_DEFINITIONS,
  type OctagonTokenSymbol,
  type TokenOctagonSnapshot,
} from "@/lib/confluenceOctagon";
import { fetchAllTokenOctagonSnapshots } from "@/lib/tokenOctagonData";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface OctagonCache {
  fearGreed: number;
  snapshots: Record<OctagonTokenSymbol, TokenOctagonSnapshot | null>;
  fetchedAt: number;
}

let memoryCache: OctagonCache | null = null;

export function useConfluenceOctagon(fearGreed = 50) {
  const [selectedToken, setSelectedToken] =
    useState<OctagonTokenSymbol>("BTC");
  const [snapshots, setSnapshots] = useState<
    Record<OctagonTokenSymbol, TokenOctagonSnapshot | null>
  >(
    memoryCache?.snapshots ??
      (Object.fromEntries(
        OCTAGON_TOKEN_DEFINITIONS.map((token) => [token.symbol, null]),
      ) as Record<OctagonTokenSymbol, TokenOctagonSnapshot | null>),
  );
  const [loading, setLoading] = useState(!memoryCache);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await fetchAllTokenOctagonSnapshots(fearGreed);
      memoryCache = {
        fearGreed,
        snapshots: next,
        fetchedAt: Date.now(),
      };
      setSnapshots(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Nepodarilo sa načítať oktágon");
    } finally {
      setLoading(false);
    }
  }, [fearGreed]);

  useEffect(() => {
    const stale =
      !memoryCache || Date.now() - memoryCache.fetchedAt > CACHE_TTL_MS;
    if (stale || memoryCache?.fearGreed !== fearGreed) {
      void refresh();
    }
  }, [fearGreed, refresh]);

  const activeSnapshot = snapshots[selectedToken] ?? null;

  return {
    tokens: OCTAGON_TOKEN_DEFINITIONS,
    selectedToken,
    setSelectedToken,
    activeSnapshot,
    snapshots,
    loading,
    error,
    refresh,
  };
}

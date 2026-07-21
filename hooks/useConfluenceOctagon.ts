"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TokenOctagonSnapshot } from "@/lib/confluenceOctagon";
import {
  octagonTokensKey,
  resolveOctagonTokensFromPortfolio,
} from "@/lib/resolveOctagonTokens";
import { fetchOctagonSnapshotsForTokens } from "@/lib/tokenOctagonData";
import type { TrackedAsset } from "@/lib/portfolioStorage";

const CACHE_TTL_MS = 5 * 60 * 1000;

interface OctagonCache {
  fearGreed: number;
  tokensKey: string;
  snapshots: Record<string, TokenOctagonSnapshot | null>;
  fetchedAt: number;
}

let memoryCache: OctagonCache | null = null;

export function useConfluenceOctagon(
  fearGreed = 50,
  portfolioSymbols?: string[],
  trackedAssets?: TrackedAsset[],
) {
  const tokens = useMemo(
    () => resolveOctagonTokensFromPortfolio(portfolioSymbols, trackedAssets),
    [portfolioSymbols, trackedAssets],
  );
  const tokensKey = octagonTokensKey(tokens);

  const [selectedToken, setSelectedToken] = useState(tokens[0]?.symbol ?? "BTC");
  const [snapshots, setSnapshots] = useState<Record<string, TokenOctagonSnapshot | null>>(
    memoryCache?.tokensKey === tokensKey ? (memoryCache.snapshots ?? {}) : {},
  );
  const [loading, setLoading] = useState(
    !memoryCache || memoryCache.tokensKey !== tokensKey,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tokens.some((token) => token.symbol === selectedToken)) {
      setSelectedToken(tokens[0]?.symbol ?? "BTC");
    }
  }, [selectedToken, tokens, tokensKey]);

  const refresh = useCallback(async () => {
    if (tokens.length === 0) return;

    setLoading(true);
    setError(null);
    try {
      const next = await fetchOctagonSnapshotsForTokens(tokens, fearGreed);
      memoryCache = {
        fearGreed,
        tokensKey,
        snapshots: next,
        fetchedAt: Date.now(),
      };
      setSnapshots(next);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Nepodarilo sa načítať oktágon",
      );
    } finally {
      setLoading(false);
    }
  }, [fearGreed, tokens, tokensKey]);

  useEffect(() => {
    const stale =
      !memoryCache ||
      Date.now() - memoryCache.fetchedAt > CACHE_TTL_MS ||
      memoryCache.tokensKey !== tokensKey ||
      memoryCache.fearGreed !== fearGreed;

    if (stale) {
      void refresh();
    }
  }, [fearGreed, refresh, tokensKey]);

  const activeSnapshot = snapshots[selectedToken] ?? null;
  const usingPortfolioTokens = (portfolioSymbols?.length ?? 0) > 0;

  return {
    tokens,
    selectedToken,
    setSelectedToken,
    activeSnapshot,
    snapshots,
    loading,
    error,
    refresh,
    usingPortfolioTokens,
  };
}

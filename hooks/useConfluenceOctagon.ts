"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { TokenOctagonSnapshot } from "@/lib/confluenceOctagon";
import {
  octagonTokensKey,
  resolveOctagonTokensFromPortfolio,
} from "@/lib/resolveOctagonTokens";
import { fetchOctagonSnapshotsForTokens } from "@/lib/tokenOctagonData";
import type { TrackedAsset } from "@/lib/portfolioStorage";
import { useAppStore } from "@/src/store/useAppStore";

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

  const storedToken = useAppStore((state) => state.octagonSelectedToken);
  const setStoredToken = useAppStore((state) => state.setOctagonSelectedToken);

  const selectedToken = useMemo(() => {
    if (storedToken && tokens.some((token) => token.symbol === storedToken)) {
      return storedToken;
    }
    return tokens[0]?.symbol ?? "BTC";
  }, [storedToken, tokens]);

  const setSelectedToken = useCallback(
    (symbol: string) => {
      setStoredToken(symbol);
    },
    [setStoredToken],
  );

  const [snapshots, setSnapshots] = useState<Record<string, TokenOctagonSnapshot | null>>(
    () =>
      memoryCache?.tokensKey === tokensKey ? (memoryCache.snapshots ?? {}) : {},
  );
  const [isFetching, setIsFetching] = useState(
    !memoryCache || memoryCache.tokensKey !== tokensKey,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storedToken || !tokens.some((token) => token.symbol === storedToken)) {
      setStoredToken(tokens[0]?.symbol ?? "BTC");
    }
  }, [setStoredToken, storedToken, tokens, tokensKey]);

  const refresh = useCallback(async () => {
    if (tokens.length === 0) return;

    setIsFetching(true);
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
      setIsFetching(false);
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
      return;
    }

    if (memoryCache?.tokensKey === tokensKey) {
      setSnapshots(memoryCache.snapshots);
      setIsFetching(false);
    }
  }, [fearGreed, refresh, tokensKey]);

  const activeSnapshot = snapshots[selectedToken] ?? null;
  const usingPortfolioTokens = (portfolioSymbols?.length ?? 0) > 0;
  const tokenSwitchLoading = isFetching && !activeSnapshot;

  const scoresBySymbol = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(snapshots).map(([symbol, snapshot]) => [
          symbol,
          snapshot?.accumulationScore,
        ]),
      ),
    [snapshots],
  );

  return {
    tokens,
    selectedToken,
    setSelectedToken,
    activeSnapshot,
    snapshots,
    scoresBySymbol,
    loading: isFetching,
    tokenSwitchLoading,
    error,
    refresh,
    usingPortfolioTokens,
  };
}

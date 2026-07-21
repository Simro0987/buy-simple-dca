"use client";

import { useMemo } from "react";
import {
  octagonTokensKey,
  resolveOctagonTokensFromPortfolio,
} from "@/lib/resolveOctagonTokens";
import type { TrackedAsset } from "@/lib/portfolioStorage";

/**
 * Resolves the DCA octagon/advisor token list from live portfolio holdings.
 * Falls back to the default basket (BTC, ETH, SOL, HYPE, JUP) when empty.
 */
export function useDcaPortfolioTokens(
  portfolioSymbols?: string[],
  trackedAssets?: TrackedAsset[],
) {
  return useMemo(() => {
    const tokens = resolveOctagonTokensFromPortfolio(
      portfolioSymbols,
      trackedAssets,
    );
    return {
      tokens,
      tokensKey: octagonTokensKey(tokens),
      usingPortfolioTokens: (portfolioSymbols?.length ?? 0) > 0,
    };
  }, [portfolioSymbols, trackedAssets]);
}

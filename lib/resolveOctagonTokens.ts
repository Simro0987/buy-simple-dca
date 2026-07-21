import { ALL_DCA_TOKENS } from "@/lib/dcaMarketData";
import {
  DEFAULT_OCTAGON_BASKET,
  type OctagonTokenDefinition,
} from "@/lib/confluenceOctagon";
import type { TrackedAsset } from "@/lib/portfolioStorage";

const DCA_BY_SYMBOL = new Map(
  ALL_DCA_TOKENS.map((token) => [token.symbol, token]),
);

export function resolveOctagonTokensFromPortfolio(
  portfolioSymbols?: string[],
  trackedAssets?: TrackedAsset[],
): OctagonTokenDefinition[] {
  const normalizedSymbols = [
    ...new Set(
      (portfolioSymbols ?? [])
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean),
    ),
  ];

  if (normalizedSymbols.length === 0) {
    return [...DEFAULT_OCTAGON_BASKET];
  }

  const trackedBySymbol = new Map(
    (trackedAssets ?? []).map((asset) => [asset.symbol.toUpperCase(), asset]),
  );

  const resolved = normalizedSymbols.map((symbol) => {
    const tracked = trackedBySymbol.get(symbol);
    const dca = DCA_BY_SYMBOL.get(symbol);
    return {
      symbol,
      name: tracked?.name ?? dca?.name ?? symbol,
      binanceSymbol: dca?.binanceSymbol ?? `${symbol}USDT`,
    } satisfies OctagonTokenDefinition;
  });

  return resolved.length > 0 ? resolved : [...DEFAULT_OCTAGON_BASKET];
}

export function octagonTokensKey(tokens: OctagonTokenDefinition[]): string {
  return tokens.map((token) => token.symbol).join(",");
}

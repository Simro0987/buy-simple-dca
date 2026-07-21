const DEFI_TOKEN_BRAND_COLORS: Record<string, string> = {
  AAVE: "#B6509E",
  PENDLE: "#1FA67A",
  GMX: "#4E64FF",
  JUP: "#7AE582",
  MORPHO: "#2973FF",
  HYPE: "#97FCE4",
  LINK: "#2A5ADA",
  ETH: "#627EEA",
  BTC: "#F7931A",
  SOL: "#9945FF",
};

function hashToColor(symbol: string): string {
  const hash = symbol
    .toUpperCase()
    .split("")
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const hue = hash % 360;
  return `hsl(${hue}, 68%, 52%)`;
}

export function getTokenBrandColor(symbol: string): string {
  return DEFI_TOKEN_BRAND_COLORS[symbol.toUpperCase()] ?? hashToColor(symbol);
}

export const DEFI_TOKEN_SYMBOLS = new Set([
  "AAVE",
  "PENDLE",
  "GMX",
  "JUP",
  "MORPHO",
  "HYPE",
  "LINK",
  "UNI",
  "CRV",
  "LDO",
  "MKR",
  "COMP",
]);

export function isDefiToken(symbol: string): boolean {
  return DEFI_TOKEN_SYMBOLS.has(symbol.toUpperCase());
}

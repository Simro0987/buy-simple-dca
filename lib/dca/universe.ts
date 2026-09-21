import type { DcaSymbol, DcaTokenMeta } from "@/lib/dca/types";

export const DCA_TOKENS: DcaTokenMeta[] = [
  {
    symbol: "BTC",
    name: "Bitcoin",
    binance: "BTCUSDT",
    category: "CORE",
    subTags: [],
  },
  {
    symbol: "ETH",
    name: "Ethereum",
    binance: "ETHUSDT",
    category: "SATELLITE",
    subTags: ["YIELD", "DEFI"],
  },
  {
    symbol: "SOL",
    name: "Solana",
    binance: "SOLUSDT",
    category: "SATELLITE",
    subTags: ["YIELD"],
  },
  {
    symbol: "LINK",
    name: "Chainlink",
    binance: "LINKUSDT",
    category: "SATELLITE",
    subTags: ["YIELD", "DEFI"],
  },
  {
    symbol: "AAVE",
    name: "Aave",
    binance: "AAVEUSDT",
    category: "SATELLITE",
    subTags: ["YIELD", "DEFI"],
  },
  {
    symbol: "UNI",
    name: "Uniswap",
    binance: "UNIUSDT",
    category: "SATELLITE",
    subTags: ["DEFI"],
  },
  // HYPEUSDT is not always listed on Binance spot (vision/geo). REST falls back to CoinGecko.
  {
    symbol: "HYPE",
    name: "Hyperliquid",
    binance: "HYPEUSDT",
    category: "HIGH_BETA",
    subTags: ["DEFI"],
  },
  {
    symbol: "ZEC",
    name: "Zcash",
    binance: "ZECUSDT",
    category: "HIGH_BETA",
    subTags: [],
  },
  {
    symbol: "INJ",
    name: "Injective",
    binance: "INJUSDT",
    category: "HIGH_BETA",
    subTags: ["DEFI"],
  },
];

export const DCA_SYMBOLS = DCA_TOKENS.map((token) => token.symbol);

export const BINANCE_ALLOWED_PAIRS = new Set(
  DCA_TOKENS.map((token) => token.binance),
);

export const TOKEN_BY_SYMBOL: Record<DcaSymbol, DcaTokenMeta> = Object.fromEntries(
  DCA_TOKENS.map((token) => [token.symbol, token]),
) as Record<DcaSymbol, DcaTokenMeta>;

export const CORE_HOLDING_SYMBOLS = ["BTC", "ETH", "SOL"] as const;

export function isDcaSymbol(value: string): value is DcaSymbol {
  return DCA_SYMBOLS.includes(value as DcaSymbol);
}

export function isCoreHoldingSymbol(
  value: string,
): value is (typeof CORE_HOLDING_SYMBOLS)[number] {
  return CORE_HOLDING_SYMBOLS.includes(
    value as (typeof CORE_HOLDING_SYMBOLS)[number],
  );
}

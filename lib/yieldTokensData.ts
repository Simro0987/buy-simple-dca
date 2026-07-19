export interface YieldToken {
  symbol: string;
  name: string;
  balance: number;
  usdValue: number;
  change7dUsd: number;
  change7dPercent: number;
  accent: string;
  ring: string;
}

export const yieldTokens: YieldToken[] = [
  {
    symbol: "LINK",
    name: "Chainlink",
    balance: 0,
    usdValue: 0,
    change7dUsd: 0,
    change7dPercent: 0,
    accent: "bg-blue-500",
    ring: "ring-blue-500/30",
  },
  {
    symbol: "GMX",
    name: "GMX",
    balance: 0,
    usdValue: 0,
    change7dUsd: 0,
    change7dPercent: 0,
    accent: "bg-sky-500",
    ring: "ring-sky-500/30",
  },
  {
    symbol: "HYPE",
    name: "Hyperliquid",
    balance: 0,
    usdValue: 0,
    change7dUsd: 0,
    change7dPercent: 0,
    accent: "bg-fuchsia-500",
    ring: "ring-fuchsia-500/30",
  },
  {
    symbol: "JUP",
    name: "Jupiter",
    balance: 0,
    usdValue: 0,
    change7dUsd: 0,
    change7dPercent: 0,
    accent: "bg-teal-500",
    ring: "ring-teal-500/30",
  },
  {
    symbol: "PENDLE",
    name: "Pendle",
    balance: 0,
    usdValue: 0,
    change7dUsd: 0,
    change7dPercent: 0,
    accent: "bg-purple-500",
    ring: "ring-purple-500/30",
  },
  {
    symbol: "AAVE",
    name: "Aave",
    balance: 0,
    usdValue: 0,
    change7dUsd: 0,
    change7dPercent: 0,
    accent: "bg-pink-500",
    ring: "ring-pink-500/30",
  },
  {
    symbol: "MORPHO",
    name: "Morpho",
    balance: 0,
    usdValue: 0,
    change7dUsd: 0,
    change7dPercent: 0,
    accent: "bg-indigo-500",
    ring: "ring-indigo-500/30",
  },
];

export function formatYieldBalance(balance: number, symbol: string) {
  return `${balance.toFixed(6)} ${symbol}`;
}

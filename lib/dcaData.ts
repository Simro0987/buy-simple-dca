export const dcaEngineData = {
  moneyMode: "CAPITULATION",
  score: 18,
  marketRegime: {
    label: "BEAR",
    description: "Medvedí trend",
    finalScore: 18,
    allocationPercent: 66,
    investmentAmount: 284.46,
  },
  factors: [
    { name: "Value", score: 88, status: "Strong Buy" },
    { name: "Trend", score: 22, status: "Bearish" },
    { name: "Sentiment", score: 18, status: "Extreme Fear" },
    { name: "Momentum", score: 34, status: "Weak" },
    { name: "Risk", score: 71, status: "Favorable" },
  ],
  tokenAllocations: [
    {
      symbol: "BTC",
      name: "Bitcoin",
      weight: 54,
      amount: 153.61,
      marketShare: 62,
      limitShare: 38,
      accent: "orange" as const,
    },
    {
      symbol: "ETH",
      name: "Ethereum",
      weight: 25,
      amount: 71.12,
      marketShare: 55,
      limitShare: 45,
      accent: "purple" as const,
    },
    {
      symbol: "SOL",
      name: "Solana",
      weight: 10,
      amount: 28.46,
      marketShare: 48,
      limitShare: 52,
      accent: "cyan" as const,
    },
  ],
};

export type TokenAccent = "orange" | "purple" | "cyan";

export const tokenAccentStyles: Record<
  TokenAccent,
  { icon: string; market: string; limit: string; text: string }
> = {
  orange: {
    icon: "bg-orange-500 ring-orange-500/30",
    market: "bg-amber-400",
    limit: "bg-orange-500",
    text: "text-orange-400",
  },
  purple: {
    icon: "bg-purple-500 ring-purple-500/30",
    market: "bg-violet-400",
    limit: "bg-purple-500",
    text: "text-purple-400",
  },
  cyan: {
    icon: "bg-gradient-to-br from-cyan-400 to-blue-500 ring-cyan-400/30",
    market: "bg-cyan-400",
    limit: "bg-blue-500",
    text: "text-cyan-400",
  },
};

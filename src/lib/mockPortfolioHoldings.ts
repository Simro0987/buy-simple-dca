export type PortfolioSymbol = 'BTC' | 'ETH' | 'SOL';

export interface MockHolding {
  amount: number;
  avgBuyPrice: number;
}

/** Demo holdings used when no Supabase / manual portfolio data is present. */
export const MOCK_PORTFOLIO_HOLDINGS: Record<PortfolioSymbol, MockHolding> = {
  BTC: { amount: 0.01746423, avgBuyPrice: 65_000 },
  ETH: { amount: 0.23278498, avgBuyPrice: 3_200 },
  SOL: { amount: 2.60983568, avgBuyPrice: 140 },
};

const CG_ID: Record<PortfolioSymbol, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
};

const TARGET_PCT: Record<PortfolioSymbol, number> = {
  BTC: 0.64,
  ETH: 0.25,
  SOL: 0.11,
};

export interface LiveHoldingMetric {
  symbol: PortfolioSymbol;
  coingeckoId: string;
  holdings: number;
  avgBuyPrice: number;
  invested: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPct: number;
  actualPct: number;
  targetPct: number;
  deviationPct: number;
}

export function buildMockLiveMetrics(
  prices: Record<string, number | undefined>,
): { assets: LiveHoldingMetric[]; totalValue: number; totalInvested: number; totalPnl: number; totalPnlPct: number } {
  const assets = (Object.keys(MOCK_PORTFOLIO_HOLDINGS) as PortfolioSymbol[]).map((symbol) => {
    const holding = MOCK_PORTFOLIO_HOLDINGS[symbol];
    const coingeckoId = CG_ID[symbol];
    const currentPrice = Number(prices[coingeckoId] ?? 0);
    const invested = holding.amount * holding.avgBuyPrice;
    const value = holding.amount * currentPrice;
    const pnl = value - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    return {
      symbol,
      coingeckoId,
      holdings: holding.amount,
      avgBuyPrice: holding.avgBuyPrice,
      invested,
      currentPrice,
      value,
      pnl,
      pnlPct,
      actualPct: 0,
      targetPct: TARGET_PCT[symbol],
      deviationPct: 0,
    };
  });

  const totalValue = assets.reduce((s, a) => s + a.value, 0);
  const totalInvested = assets.reduce((s, a) => s + a.invested, 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  for (const asset of assets) {
    asset.actualPct = totalValue > 0 ? asset.value / totalValue : 0;
    asset.deviationPct = (asset.actualPct - asset.targetPct) * 100;
  }

  return { assets, totalValue, totalInvested, totalPnl, totalPnlPct };
}

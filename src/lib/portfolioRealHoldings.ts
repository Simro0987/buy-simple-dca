import { TOKENS } from '@/lib/crypto';
import {
  computePortfolioTotalValue,
  livePricesFromMap,
} from '@/lib/portfolioTotalValue';

export type PortfolioSymbol = 'BTC' | 'ETH' | 'SOL';

export interface UserHoldingRow {
  tokenAmount: number;
  averageBuyPrice: number;
  investedUsd: number;
}

export type UserHoldings = Record<PortfolioSymbol, UserHoldingRow>;

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

export interface PortfolioDashboardMetrics {
  assets: LiveHoldingMetric[];
  totalValue: number;
  totalInvested: number;
  totalPnl: number;
  totalPnlPct: number;
}

export const PORTFOLIO_REAL_HOLDINGS_KEY = 'portfolio_real_holdings';

const TARGET_PCT: Record<PortfolioSymbol, number> = {
  BTC: 0.64,
  ETH: 0.25,
  SOL: 0.11,
};

const CG_ID: Record<PortfolioSymbol, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
};

export const EMPTY_USER_HOLDINGS: UserHoldings = {
  BTC: { tokenAmount: 0, averageBuyPrice: 0, investedUsd: 0 },
  ETH: { tokenAmount: 0, averageBuyPrice: 0, investedUsd: 0 },
  SOL: { tokenAmount: 0, averageBuyPrice: 0, investedUsd: 0 },
};

function normalizeRow(row: Partial<UserHoldingRow> | undefined): UserHoldingRow {
  return {
    tokenAmount: Number(row?.tokenAmount ?? 0) || 0,
    averageBuyPrice: Number(row?.averageBuyPrice ?? 0) || 0,
    investedUsd: Number(row?.investedUsd ?? 0) || 0,
  };
}

export function loadUserHoldings(): UserHoldings {
  try {
    const raw = localStorage.getItem(PORTFOLIO_REAL_HOLDINGS_KEY);
    if (!raw) return { ...EMPTY_USER_HOLDINGS };
    const parsed = JSON.parse(raw) as Partial<UserHoldings>;
    return {
      BTC: normalizeRow(parsed.BTC),
      ETH: normalizeRow(parsed.ETH),
      SOL: normalizeRow(parsed.SOL),
    };
  } catch {
    return { ...EMPTY_USER_HOLDINGS };
  }
}

export function saveUserHoldings(holdings: UserHoldings): void {
  localStorage.setItem(PORTFOLIO_REAL_HOLDINGS_KEY, JSON.stringify(holdings));
}

export function buildDashboardFromUserHoldings(
  userHoldings: UserHoldings,
  livePriceMap: { bitcoin?: number; ethereum?: number; solana?: number },
): PortfolioDashboardMetrics {
  const { liveBtcPrice, liveEthPrice, liveSolPrice } = livePricesFromMap(livePriceMap);

  const totalValue = computePortfolioTotalValue(
    userHoldings.BTC.tokenAmount,
    userHoldings.ETH.tokenAmount,
    userHoldings.SOL.tokenAmount,
    liveBtcPrice,
    liveEthPrice,
    liveSolPrice,
  );

  const priceBySymbol = {
    BTC: liveBtcPrice,
    ETH: liveEthPrice,
    SOL: liveSolPrice,
  } as const;

  const assets = (['BTC', 'ETH', 'SOL'] as PortfolioSymbol[]).map((symbol) => {
    const row = userHoldings[symbol];
    const token = TOKENS.find(t => t.symbol === symbol)!;
    const currentPrice = priceBySymbol[symbol];
    const value = row.tokenAmount * currentPrice;
    const invested = row.investedUsd;
    const pnl = value - invested;
    const pnlPct = invested > 0 ? (pnl / invested) * 100 : 0;
    const actualPct = totalValue > 0 ? value / totalValue : 0;
    const targetPct = token.allocation;

    return {
      symbol,
      coingeckoId: CG_ID[symbol],
      holdings: row.tokenAmount,
      avgBuyPrice: row.averageBuyPrice,
      invested,
      currentPrice,
      value,
      pnl,
      pnlPct,
      actualPct,
      targetPct,
      deviationPct: (actualPct - targetPct) * 100,
    };
  });

  const totalInvested = assets.reduce((sum, asset) => sum + asset.invested, 0);
  const totalPnl = totalValue - totalInvested;
  const totalPnlPct = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;

  return { assets, totalValue, totalInvested, totalPnl, totalPnlPct };
}

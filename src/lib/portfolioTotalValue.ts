import { MOCK_PORTFOLIO_HOLDINGS } from '@/lib/mockPortfolioHoldings';
import type { AssetMetric } from '@/hooks/usePortfolioMetrics';

export interface PortfolioCoinAmounts {
  btcAmount: number;
  ethAmount: number;
  solAmount: number;
}

export interface PortfolioLivePrices {
  liveBtcPrice: number;
  liveEthPrice: number;
  liveSolPrice: number;
}

/** Strict total portfolio USD = Σ (coin amount × live spot price). */
export function computePortfolioTotalValue(
  btcAmount: number,
  ethAmount: number,
  solAmount: number,
  liveBtcPrice: number,
  liveEthPrice: number,
  liveSolPrice: number,
): number {
  return (btcAmount * liveBtcPrice) + (ethAmount * liveEthPrice) + (solAmount * liveSolPrice);
}

export function resolvePortfolioCoinAmounts(
  useMockHoldings: boolean,
  assets: AssetMetric[],
): PortfolioCoinAmounts {
  if (useMockHoldings) {
    return {
      btcAmount: MOCK_PORTFOLIO_HOLDINGS.BTC.amount,
      ethAmount: MOCK_PORTFOLIO_HOLDINGS.ETH.amount,
      solAmount: MOCK_PORTFOLIO_HOLDINGS.SOL.amount,
    };
  }

  const holding = (symbol: 'BTC' | 'ETH' | 'SOL') =>
    Number(assets.find(a => a.symbol === symbol)?.holdings ?? 0);

  return {
    btcAmount: holding('BTC'),
    ethAmount: holding('ETH'),
    solAmount: holding('SOL'),
  };
}

export function livePricesFromMap(prices: {
  bitcoin?: number;
  ethereum?: number;
  solana?: number;
}): PortfolioLivePrices {
  return {
    liveBtcPrice: Number(prices.bitcoin ?? 0),
    liveEthPrice: Number(prices.ethereum ?? 0),
    liveSolPrice: Number(prices.solana ?? 0),
  };
}

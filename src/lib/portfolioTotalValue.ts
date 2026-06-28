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

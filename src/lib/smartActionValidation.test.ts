import { describe, expect, it } from 'vitest';
import { ensurePortfolioData } from '@/lib/portfolioData';
import {
  normalizeActionTokenFamily,
  resolvePortfolioTokenBalance,
  validateActionBalance,
} from '@/lib/smartActionValidation';

const stables = { ethereum: 100, arbitrum: 50, base: 0, solana: 25 };

function basePortfolio() {
  return ensurePortfolioData({
    loading: false,
    balancesReady: true,
    prices: { btc: 60_000, eth: 3000, sol: 150 },
    assets: {
      BTC: { symbol: 'BTC', holdings: 0, liquidQty: 0, stakedQty: 0, currentPrice: 60_000, liquidUsd: 0, stakedUsd: 0, totalUsd: 0, stakedEntries: [] },
      ETH: { symbol: 'ETH', holdings: 0, liquidQty: 0, stakedQty: 0, currentPrice: 3000, liquidUsd: 0, stakedUsd: 0, totalUsd: 0, stakedEntries: [] },
      SOL: { symbol: 'SOL', holdings: 0, liquidQty: 0, stakedQty: 0, currentPrice: 150, liquidUsd: 0, stakedUsd: 0, totalUsd: 0, stakedEntries: [] },
    },
    alchemixReserve: { eth: { symbol: 'Alchemix ETH', qty: 0, usd: 0, role: 'alchemix' } },
    activeMotor: {
      rEth: { symbol: 'rETH', qty: 0, usd: 0, role: 'motor' },
      mSol: { symbol: 'mSOL', qty: 0, usd: 0, role: 'motor' },
    },
    lbtc: { symbol: 'LBTC', qty: 0, usd: 0, role: 'motor' },
    totalAlchemixUsd: 0,
    totalMotorUsd: 0,
    ethBaseline: { totalQty: 0, totalUsd: 0, walletQty: 0, stakedQty: 0, motorQty: 0, alchemixQty: 0, otherStakedQty: 0 },
    solBaseline: { totalQty: 0, totalUsd: 0, walletQty: 0, stakedQty: 0, motorQty: 0, alchemixQty: 0, otherStakedQty: 0 },
    totalEthPortfolio: 0,
    totalSolPortfolio: 0,
  });
}

describe('smartActionValidation', () => {
  it('normalizes LST symbols to ETH family', () => {
    expect(normalizeActionTokenFamily('weETH')).toBe('ETH');
    expect(normalizeActionTokenFamily('mSOL')).toBe('SOL');
    expect(normalizeActionTokenFamily('sUSDe')).toBe('USDC');
  });

  it('sums stable balances for USDC family', () => {
    const portfolio = basePortfolio();
    portfolio.assets.ETH.liquidQty = 2;
    expect(resolvePortfolioTokenBalance(portfolio, stables, 'USDC')).toBe(175);
  });

  it('flags insufficient balance and suggests swap', () => {
    const portfolio = basePortfolio();
    portfolio.assets.ETH.liquidQty = 0.1;
    const result = validateActionBalance({
      portfolio,
      stables,
      tokenSymbol: 'weETH',
      requiredAmount: 1,
      usdAmount: 3000,
    });
    expect(result.sufficient).toBe(false);
    expect(result.shortfall).toBeGreaterThan(0);
    expect(result.swapSuggestion?.from).toBe('USDC');
    expect(result.swapSuggestion?.to).toBe('ETH');
  });

  it('passes when balance is enough', () => {
    const portfolio = basePortfolio();
    portfolio.assets.ETH.liquidQty = 5;
    const result = validateActionBalance({
      portfolio,
      stables,
      tokenSymbol: 'ETH',
      requiredAmount: 2,
    });
    expect(result.sufficient).toBe(true);
    expect(result.swapSuggestion).toBeNull();
  });
});

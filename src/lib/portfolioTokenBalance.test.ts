import { describe, expect, it } from 'vitest';
import { ensurePortfolioData } from '@/lib/portfolioData';
import {
  evaluateTokenRequirement,
  getPortfolioTokenBalance,
  isNewCollateralPosition,
  resolveSwapFundingToken,
  safeBalance,
  shouldShowRetreatWarning,
} from '@/lib/portfolioTokenBalance';

function samplePortfolio() {
  return ensurePortfolioData({
    loading: false,
    balancesReady: true,
    prices: { btc: 60_000, eth: 3000, sol: 150 },
    assets: {
      BTC: { symbol: 'BTC', holdings: 0, liquidQty: 0, stakedQty: 0, currentPrice: 60_000, liquidUsd: 0, stakedUsd: 0, totalUsd: 0, stakedEntries: [] },
      ETH: {
        symbol: 'ETH',
        holdings: 2,
        liquidQty: 0.8521,
        stakedQty: 1.2,
        currentPrice: 3000,
        liquidUsd: 2556.3,
        stakedUsd: 3600,
        totalUsd: 6000,
        stakedEntries: [
          { symbol: 'ETH', protocol: 'Rocket Pool (rETH)', amount: 0.3 },
          { symbol: 'ETH', protocol: 'Aave V3 Lending', amount: 0.8 },
        ],
      },
      SOL: { symbol: 'SOL', holdings: 10, liquidQty: 4, stakedQty: 6, currentPrice: 150, liquidUsd: 600, stakedUsd: 900, totalUsd: 1500, stakedEntries: [] },
    },
    alchemixReserve: { eth: { symbol: 'Alchemix ETH', qty: 0.2, usd: 600, role: 'alchemix' } },
    activeMotor: {
      rEth: { symbol: 'rETH', qty: 0.3, usd: 900, role: 'motor' },
      mSol: { symbol: 'mSOL', qty: 0, usd: 0, role: 'motor' },
    },
    lbtc: { symbol: 'LBTC', qty: 0, usd: 0, role: 'motor' },
    totalAlchemixUsd: 600,
    totalMotorUsd: 900,
    ethBaseline: { totalQty: 2, totalUsd: 6000, walletQty: 0.8521, stakedQty: 1.2, motorQty: 0.3, alchemixQty: 0.2, otherStakedQty: 0.7 },
    solBaseline: { totalQty: 10, totalUsd: 1500, walletQty: 4, stakedQty: 6, motorQty: 0, alchemixQty: 0, otherStakedQty: 6 },
    totalEthPortfolio: 2,
    totalSolPortfolio: 10,
  });
}

describe('portfolioTokenBalance', () => {
  it('safeBalance handles invalid values', () => {
    expect(safeBalance(undefined)).toBe(0);
    expect(safeBalance(NaN)).toBe(0);
    expect(safeBalance(-1)).toBe(0);
  });

  it('returns exact token identity balance from PortfolioData', () => {
    const portfolio = samplePortfolio();
    expect(getPortfolioTokenBalance(portfolio, 'ETH')).toBe(0.8521);
    expect(getPortfolioTokenBalance(portfolio, 'wstETH')).toBe(0);
    expect(getPortfolioTokenBalance(portfolio, 'rETH')).toBe(0.3);
  });

  it('never conflates ETH wallet balance with wstETH held amount', () => {
    const check = evaluateTokenRequirement(samplePortfolio(), 'wstETH', 0.1118, { totalUsd: 335.4 });
    expect(check.hasEnoughToken).toBe(false);
    expect(check.heldAmount).toBe(0);
    expect(check.requiredToken).toBe('wstETH');
    expect(check.swapDeficitAmount).toBeCloseTo(0.1118, 6);
    expect(check.swapDeficitUsd).toBeCloseTo(335.4, 1);
    expect(check.swapFromToken).toBe('ETH');
  });

  it('swap deficit is partial not full wallet', () => {
    const check = evaluateTokenRequirement(samplePortfolio(), 'wstETH', 0.1118, { totalUsd: 335.4 });
    expect(check.swapDeficitUsd).toBeLessThan(0.8521 * 3000);
  });

  it('maps swap funding token without changing held display token', () => {
    expect(resolveSwapFundingToken('wstETH')).toBe('ETH');
  });

  it('passes when required token balance is sufficient', () => {
    const check = evaluateTokenRequirement(samplePortfolio(), 'ETH', 0.4);
    expect(check.hasEnoughToken).toBe(true);
    expect(check.heldAmount).toBe(0.8521);
  });

  it('hides retreat warning when LTV is zero and no debt', () => {
    expect(shouldShowRetreatWarning({
      exitActive: true,
      variant: 'urgent',
      collateralQty: 0,
      debtUsd: 0,
      ltvPct: 0,
    })).toBe(false);
  });

  it('shows retreat warning only with active debt position', () => {
    expect(shouldShowRetreatWarning({
      exitActive: true,
      variant: 'urgent',
      collateralQty: 1,
      debtUsd: 500,
      ltvPct: 25,
    })).toBe(true);
  });

  it('detects new collateral position', () => {
    expect(isNewCollateralPosition(0, 0)).toBe(true);
    expect(isNewCollateralPosition(0.5, 0)).toBe(false);
  });
});

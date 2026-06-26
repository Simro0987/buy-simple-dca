import { describe, expect, it } from 'vitest';
import { buildPositionOverview, formatPositionQty, safeQty } from '@/lib/positionOverview';
import { ensurePortfolioData } from '@/lib/portfolioData';

function samplePortfolio() {
  return ensurePortfolioData({
    loading: false,
    balancesReady: true,
    prices: { btc: 60_000, eth: 3000, sol: 150 },
    assets: {
      BTC: { symbol: 'BTC', holdings: 0, liquidQty: 0, stakedQty: 0, currentPrice: 60_000, liquidUsd: 0, stakedUsd: 0, totalUsd: 0, stakedEntries: [] },
      ETH: { symbol: 'ETH', holdings: 2, liquidQty: 0.5, stakedQty: 1.2, currentPrice: 3000, liquidUsd: 1500, stakedUsd: 3600, totalUsd: 6000, stakedEntries: [] },
      SOL: { symbol: 'SOL', holdings: 10, liquidQty: 4, stakedQty: 6, currentPrice: 150, liquidUsd: 600, stakedUsd: 900, totalUsd: 1500, stakedEntries: [] },
    },
    alchemixReserve: { eth: { symbol: 'Alchemix ETH', qty: 0.8, usd: 2400, role: 'alchemix' } },
    activeMotor: {
      rEth: { symbol: 'rETH', qty: 0.6, usd: 1800, role: 'motor' },
      mSol: { symbol: 'mSOL', qty: 5, usd: 750, role: 'motor' },
    },
    lbtc: { symbol: 'LBTC', qty: 0, usd: 0, role: 'motor' },
    totalAlchemixUsd: 2400,
    totalMotorUsd: 2550,
    ethBaseline: { totalQty: 2, totalUsd: 6000, walletQty: 0.5, stakedQty: 1.2, motorQty: 0.6, alchemixQty: 0.8, otherStakedQty: 0 },
    solBaseline: { totalQty: 10, totalUsd: 1500, walletQty: 4, stakedQty: 6, motorQty: 5, alchemixQty: 0, otherStakedQty: 1 },
    totalEthPortfolio: 2,
    totalSolPortfolio: 10,
  });
}

describe('positionOverview', () => {
  it('safeQty returns 0 for invalid values', () => {
    expect(safeQty(undefined)).toBe(0);
    expect(safeQty(NaN)).toBe(0);
    expect(safeQty(-1)).toBe(0);
  });

  it('staking mode shows wallet and staked only', () => {
    const data = buildPositionOverview({
      mode: 'staking',
      symbol: 'ETH',
      portfolio: samplePortfolio(),
    });
    expect(data.showWallet).toBe(true);
    expect(data.showStaked).toBe(true);
    expect(data.showCollateral).toBe(false);
    expect(data.showBorrow).toBe(false);
    expect(data.walletQty).toBe(0.5);
    expect(data.stakedQty).toBe(1.2);
  });

  it('lending mode includes collateral and borrow', () => {
    const data = buildPositionOverview({
      mode: 'lending',
      symbol: 'ETH',
      tokenLabel: 'weETH',
      portfolio: samplePortfolio(),
      usdcDebt: 1200,
    });
    expect(data.showBorrow).toBe(true);
    expect(data.collateralQty).toBe(0.6);
    expect(data.borrowQty).toBe(1200);
    expect(formatPositionQty(data.borrowQty, 2)).toBe('1200.00');
  });

  it('never throws on missing portfolio', () => {
    expect(() => buildPositionOverview({ mode: 'lending', symbol: 'SOL' })).not.toThrow();
    const data = buildPositionOverview({ mode: 'lending', symbol: 'SOL' });
    expect(data.walletQty).toBe(0);
  });
});

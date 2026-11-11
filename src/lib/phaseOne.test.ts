import { describe, expect, it, beforeEach } from 'vitest';
import { parseLivePrices } from './liveMarketPrices';
import { rawTokenAmount } from './tokenAmount';
import { parseYieldRoutes } from './yieldScanner';
import { usePortfolioActionStore } from '@/stores/portfolioActionStore';
import { getActiveStakes } from '@/stores/activeStakingStore';

describe('live market data', () => {
  it('uses exactly the prices returned for BTC ETH SOL', () => {
    expect(parseLivePrices({ bitcoin: { usd: 103123.45 }, ethereum: { usd: 3210.78 }, solana: { usd: 151.23 } }, 123))
      .toEqual({ btc: 103123.45, eth: 3210.78, sol: 151.23, updatedAt: 123 });
  });
  it('rejects missing prices instead of manufacturing mock values', () => {
    expect(() => parseLivePrices({ bitcoin: { usd: 1 } })).toThrow();
  });
});

describe('token amount serialization', () => {
  it('copies raw 0.0461 without symbols', () => { expect(rawTokenAmount(0.0461)).toBe('0.0461'); });
  it('preserves the exact 0.8878 quantity', () => { expect(rawTokenAmount(0.8878)).toBe('0.8878'); });
  it('does not round tiny quantities to zero', () => { expect(rawTokenAmount(0.00000001)).toBe('0.00000001'); });
});

describe('real yields', () => {
  const pool = { project: 'aave-v3', chain: 'Ethereum', symbol: 'WBTC', apy: 0.00334, tvlUsd: 2000000 };
  it('keeps real zero APY and excludes missing APY', () => {
    expect(parseYieldRoutes([{ ...pool, apy: 0 }, { ...pool, apy: null }]).map(r => r.supplyApy)).toEqual([0]);
  });
  it('does not turn an absent borrow rate into zero', () => { expect(parseYieldRoutes([pool])[0].borrowApy).toBeNull(); });
  it('excludes APY above 100%', () => { expect(parseYieldRoutes([{ ...pool, apy: 101 }])).toEqual([]); });
  it('keeps the live Morpho APY', () => { expect(parseYieldRoutes([{ ...pool, project: 'morpho-blue', apy: 2.41 }])[0].supplyApy).toBe(2.41); });
});

describe('global portfolio action recording', () => {
  beforeEach(() => { localStorage.clear(); usePortfolioActionStore.getState().reset(); });
  it('records and transfers staking only once', () => {
    const action = { id: 'SOL:staking', symbol: 'SOL', amount: 0.8878, stakeProtocol: 'Ledger' };
    expect(usePortfolioActionStore.getState().execute(action)).toBe(true);
    expect(usePortfolioActionStore.getState().execute(action)).toBe(false);
    expect(getActiveStakes()[0].amount).toBe(0.8878);
    expect(usePortfolioActionStore.getState().store[action.id].amount).toBe(0.8878);
  });
  it('rejects invalid amounts', () => { expect(usePortfolioActionStore.getState().execute({ id: 'invalid', symbol: 'SOL', amount: NaN })).toBe(false); });
});
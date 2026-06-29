import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  DEFAULT_MARKET_DATA,
  extractEthStakingApy,
  fetchCyborgMarketData,
  loadCachedMarketData,
  mergeMarketData,
  saveCachedMarketData,
} from '@/lib/cyborgMarketDataFeed';

describe('cyborgMarketDataFeed', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('extractEthStakingApy picks Rocket Pool rETH yield', () => {
    const apy = extractEthStakingApy([
      { project: 'rocket-pool', symbol: 'RETH', chain: 'Ethereum', apy: 3.4 },
      { project: 'aave-v3', symbol: 'WETH', chain: 'Ethereum', apy: 1.8 },
    ]);
    expect(apy).toBeCloseTo(3.4, 2);
  });

  it('mergeMarketData preserves cached values on partial patch', () => {
    const merged = mergeMarketData(DEFAULT_MARKET_DATA, { btcPrice: 100_000, ethPrice: 3_500, solPrice: 140 });
    expect(merged.btcPrice).toBe(100_000);
    expect(merged.ethPrice).toBe(3_500);
    expect(merged.solPrice).toBe(140);
    expect(merged.protocolAPY).toBe(DEFAULT_MARKET_DATA.protocolAPY);
  });

  it('fetchCyborgMarketData uses cache fallback when APIs fail', async () => {
    saveCachedMarketData({
      ...DEFAULT_MARKET_DATA,
      btcPrice: 95_000,
      ethPrice: 3_200,
      solPrice: 130,
      protocolAPY: 3.5,
      fearGreedIndex: 22,
      lastUpdatedAt: Date.now(),
      source: 'live',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    const data = await fetchCyborgMarketData(22);
    expect(data.btcPrice).toBe(95_000);
    expect(data.ethPrice).toBe(3_200);
    expect(data.fearGreedIndex).toBe(22);
    expect(data.source).toBe('cache');
  });

  it('loadCachedMarketData returns defaults when cache empty', () => {
    expect(loadCachedMarketData().protocolAPY).toBe(DEFAULT_MARKET_DATA.protocolAPY);
  });
});

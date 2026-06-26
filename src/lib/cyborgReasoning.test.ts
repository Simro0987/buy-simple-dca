import { describe, expect, it } from 'vitest';
import {
  buildCyborgReason,
  getDynamicReason,
  marketTrendFromScore,
  normalizeTokenSymbol,
  resolveActionType,
  resolveTokenPrice,
} from '@/lib/cyborgReasoning';
import type { ReasoningContext } from '@/lib/cyborgReasoning';
import type { CyborgMarketData } from '@/lib/cyborgMarketDataFeed';

const baseCtx = (): ReasoningContext => ({
  marketScore: 19,
  fearGreed: 19,
  regime: 'bear',
  marketMode: 'ACCUMULATION',
  stakedRatio: 0.35,
  totalBalanceUsd: 50_000,
  weightedApyPct: 4.2,
});

const liveMarket = (): CyborgMarketData => ({
  btcPrice: 98_000,
  ethPrice: 3_450,
  solPrice: 145,
  fearGreedIndex: 19,
  protocolAPY: 3.8,
  protocolAPY12mAvg: 3.2,
  lastUpdatedAt: Date.now(),
  source: 'live',
});

describe('cyborgReasoning', () => {
  it('classifies market trend from score', () => {
    expect(marketTrendFromScore(19)).toBe('bear');
    expect(marketTrendFromScore(75)).toBe('bull');
    expect(marketTrendFromScore(50)).toBe('neutral');
  });

  it('normalizes token labels', () => {
    expect(normalizeTokenSymbol('sol')).toBe('SOL');
    expect(normalizeTokenSymbol('mSOL')).toBe('SOL');
  });

  it('resolves token price from market data', () => {
    const md = liveMarket();
    expect(resolveTokenPrice('SOL', md)).toBe(145);
    expect(resolveTokenPrice('ETH', md)).toBe(3_450);
  });

  it('getDynamicReason uses SOL price for collateral copy', () => {
    const text = getDynamicReason('COLLATERAL', 19, 'SOL', {
      lang: 'sk',
      marketData: liveMarket(),
    });
    expect(text).toContain('kolaterálu: SOL $145');
    expect(text).not.toContain('ETH $');
  });

  it('getDynamicReason uses SOL for staking copy', () => {
    const text = getDynamicReason('STAKE', 19, 'SOL', {
      lang: 'sk',
      marketData: liveMarket(),
    });
    expect(text).toContain('Staking SOL');
    expect(text).toContain('SOL $145');
    expect(text).not.toMatch(/cene ETH/i);
  });

  it('getDynamicReason uses Fear&Greed for DCA with token symbol', () => {
    const text = getDynamicReason('DCA', 19, 'SOL', {
      lang: 'sk',
      marketData: liveMarket(),
    });
    expect(text).toContain('DCA Nákup SOL');
    expect(text).toContain('Fear&Greed Index je 19');
  });

  it('buildCyborgReason passes explicit token symbol', () => {
    const text = buildCyborgReason('collateral', baseCtx(), 'sk', liveMarket(), 'SOL');
    expect(text).toContain('SOL $145');
  });

  it('returns English copy when lang is en', () => {
    const text = getDynamicReason('DCA', 19, 'BTC', { lang: 'en', marketData: liveMarket() });
    expect(text).toContain('DCA Buy BTC');
    expect(text).toContain('fear');
  });
});

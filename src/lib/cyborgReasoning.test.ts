import { describe, expect, it } from 'vitest';
import {
  buildCyborgReason,
  getDynamicReason,
  marketTrendFromScore,
  resolveActionType,
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

  it('maps granular actions to coarse action types', () => {
    expect(resolveActionType('stake_eth')).toBe('STAKE');
    expect(resolveActionType('dca_buy_btc')).toBe('DCA');
    expect(resolveActionType('collateral_deposit')).toBe('COLLATERAL');
  });

  it('getDynamicReason uses live market data for STAKE', () => {
    const text = getDynamicReason('STAKE', 19, {
      lang: 'sk',
      symbol: 'ETH',
      marketData: liveMarket(),
    });
    expect(text).toContain('Staking ETH');
    expect(text).toContain('APY 3.8%');
    expect(text).toContain('ETH $3,450');
  });

  it('getDynamicReason uses Fear&Greed for DCA in fear zone', () => {
    const text = getDynamicReason('DCA', 19, {
      lang: 'sk',
      marketData: liveMarket(),
    });
    expect(text).toContain('DCA Nákup');
    expect(text).toContain('Fear&Greed Index je 19');
    expect(text).toContain('strach');
  });

  it('getDynamicReason varies DCA text when F&G is elevated', () => {
    const fear = getDynamicReason('DCA', 19, { lang: 'sk', marketData: liveMarket() });
    const greed = getDynamicReason('DCA', 70, {
      lang: 'sk',
      marketData: { ...liveMarket(), fearGreedIndex: 78 },
    });
    expect(fear).not.toBe(greed);
  });

  it('getDynamicReason returns collateral copy with ETH price feed', () => {
    const text = getDynamicReason('COLLATERAL', 19, {
      lang: 'sk',
      marketData: liveMarket(),
    });
    expect(text).toContain('kolaterálu');
    expect(text).toContain('3,450');
  });

  it('buildCyborgReason passes market data through', () => {
    const text = buildCyborgReason('stake_eth', baseCtx(), 'sk', liveMarket());
    expect(text).toContain('APY 3.8%');
  });

  it('returns English copy when lang is en', () => {
    const text = getDynamicReason('DCA', 19, { lang: 'en', marketData: liveMarket() });
    expect(text).toContain('Fear & Greed Index');
    expect(text).toContain('fear');
  });
});

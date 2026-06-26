import { describe, expect, it } from 'vitest';
import { buildCyborgReason, marketTrendFromScore } from '@/lib/cyborgReasoning';
import type { ReasoningContext } from '@/lib/cyborgReasoning';

const baseCtx = (): ReasoningContext => ({
  marketScore: 19,
  fearGreed: 19,
  regime: 'bear',
  marketMode: 'ACCUMULATION',
  stakedRatio: 0.35,
  totalBalanceUsd: 50_000,
  weightedApyPct: 4.2,
});

describe('cyborgReasoning', () => {
  it('classifies market trend from score', () => {
    expect(marketTrendFromScore(19)).toBe('bear');
    expect(marketTrendFromScore(75)).toBe('bull');
    expect(marketTrendFromScore(50)).toBe('neutral');
  });

  it('returns stake ETH reasoning for bear market', () => {
    const text = buildCyborgReason('stake_eth', baseCtx(), 'sk');
    expect(text).toContain('Prečo:');
    expect(text).toContain('19/100');
    expect(text.toLowerCase()).toContain('staking');
  });

  it('returns DCA buy reasoning for oversold score', () => {
    const text = buildCyborgReason('dca_buy', baseCtx(), 'sk');
    expect(text).toContain('prepredaný');
    expect(text).toContain('19/100');
  });

  it('returns collateral reasoning with sentiment', () => {
    const text = buildCyborgReason('collateral', baseCtx(), 'sk');
    expect(text).toContain('Arbitrum');
    expect(text).toContain('19');
  });

  it('returns English copy when lang is en', () => {
    const text = buildCyborgReason('dca_buy_btc', baseCtx(), 'en');
    expect(text.startsWith('Why:')).toBe(true);
    expect(text.toLowerCase()).toContain('accumulate');
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildCyborgReason,
  getDynamicReason,
  marketTrendFromScore,
  resolveActionType,
} from '@/lib/cyborgReasoning';
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

  it('maps granular actions to coarse action types', () => {
    expect(resolveActionType('stake_eth')).toBe('STAKE');
    expect(resolveActionType('dca_buy_btc')).toBe('DCA');
    expect(resolveActionType('collateral_deposit')).toBe('COLLATERAL');
  });

  it('getDynamicReason returns score-embedded STAKE copy for bear trend', () => {
    const text = getDynamicReason('STAKE', 19, { lang: 'sk', symbol: 'ETH' });
    expect(text).toContain('Staking ETH pri skóre 19/100');
    expect(text).toContain('BEAR');
  });

  it('getDynamicReason returns cheap-buy DCA copy below score 30', () => {
    const text = getDynamicReason('DCA', 19, { lang: 'sk', coin: 'BTC' });
    expect(text).toContain('DCA akumulácia BTC');
    expect(text).toContain('Skóre 19');
    expect(text).toContain('pod 30');
  });

  it('getDynamicReason varies DCA text above score 50', () => {
    const cheap = getDynamicReason('DCA', 19, { lang: 'sk' });
    const neutral = getDynamicReason('DCA', 55, { lang: 'sk' });
    const hot = getDynamicReason('DCA', 80, { lang: 'sk' });
    expect(cheap).not.toBe(neutral);
    expect(neutral).not.toBe(hot);
    expect(hot).toContain('80');
  });

  it('getDynamicReason returns collateral copy with live score', () => {
    const text = getDynamicReason('COLLATERAL', 19, { lang: 'sk', fearGreed: 19 });
    expect(text).toContain('kolaterálu');
    expect(text).toContain('19');
  });

  it('buildCyborgReason delegates to getDynamicReason via action mapping', () => {
    const text = buildCyborgReason('stake_eth', baseCtx(), 'sk');
    expect(text).toContain('Staking ETH pri skóre 19/100');
  });

  it('returns English copy when lang is en', () => {
    const text = getDynamicReason('DCA', 19, { lang: 'en', coin: 'BTC' });
    expect(text).toContain('DCA accumulation BTC');
    expect(text).toContain('below 30');
  });
});

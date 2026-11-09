import { describe, expect, it } from 'vitest';
import { allocateCoreSatellite, effectiveBasketPercentages } from './satelliteAllocation';

const macro = { SATELLITES: 25, HIGH_BETA: 15, PROXY: 5 };
const labels = { eth: 'ETH', hype: 'HYPE', mstr: 'MSTR' };
const approved = { price: 1, rsi14: 45, sieve: { passed: true, failedStep: null, reason: '', checks: [] } };
const rejected = { price: 1, rsi14: 45, sieve: { passed: false, failedStep: 1 as const, reason: '', checks: [] } };

describe('effective basket display after waterfall', () => {
  it('moves fully rejected High-Beta into Satellites, not BTC', () => {
    const allocation = allocateCoreSatellite(1000, 55, { eth: approved, hype: rejected, mstr: approved }, ['eth', 'hype', 'mstr'], labels, macro);
    expect(allocation.basketUsd).toEqual({ CORE: 550, SATELLITES: 400, HIGH_BETA: 0, PROXY: 50 });
    expect(effectiveBasketPercentages(allocation.basketUsd)).toEqual({ CORE: 55, SATELLITES: 40, HIGH_BETA: 0, PROXY: 5 });
  });

  it('moves rejected Satellites and High-Beta to BTC only when both fail', () => {
    const allocation = allocateCoreSatellite(1000, 55, { eth: rejected, hype: rejected, mstr: approved }, ['eth', 'hype', 'mstr'], labels, macro);
    expect(effectiveBasketPercentages(allocation.basketUsd)).toEqual({ CORE: 95, SATELLITES: 0, HIGH_BETA: 0, PROXY: 5 });
  });

  it('sends rejected Proxy directly to BTC', () => {
    const allocation = allocateCoreSatellite(1000, 55, { eth: approved, hype: approved, mstr: rejected }, ['eth', 'hype', 'mstr'], labels, macro);
    expect(effectiveBasketPercentages(allocation.basketUsd)).toEqual({ CORE: 60, SATELLITES: 25, HIGH_BETA: 15, PROXY: 0 });
  });

  it('uses the actual final total and rounds to exactly 100.0%', () => {
    const shares = effectiveBasketPercentages({ CORE: 0.01, SATELLITES: 0.01, HIGH_BETA: 0.01, PROXY: 0 });
    expect(Object.values(shares).reduce((sum, pct) => sum + Math.round(pct * 10), 0)).toBe(1000);
    expect(shares.PROXY).toBe(0);
    expect(effectiveBasketPercentages({ CORE: 0, SATELLITES: 0, HIGH_BETA: 0, PROXY: 0 })).toEqual({ CORE: 0, SATELLITES: 0, HIGH_BETA: 0, PROXY: 0 });
  });
});
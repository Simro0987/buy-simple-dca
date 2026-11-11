import { describe, it, expect } from 'vitest';
import { computeRoboAction, dynamicHorizonWeeks } from './roboAdvisorEngine';

const base = { totalBtc: 1, currentDepositedWbtc: 0.15, currentDebt: 5000, weeklyBudget: 100, fearAndGreed: 40, borrowApy: 5, btcPrice: 100000 };

describe('robo advisor', () => {
  it('hardcap 25% → state A', () => {
    expect(computeRoboAction({ ...base, currentDepositedWbtc: 0.25 }).state).toBe('A');
  });
  it('APY above 8% → state B', () => {
    expect(computeRoboAction({ ...base, borrowApy: 8.1 }).state).toBe('B');
  });
  it('target LTV 30% at FG 0, 15% at FG 100', () => {
    expect(computeRoboAction({ ...base, fearAndGreed: 0 }).targetLtv).toBeCloseTo(0.30);
    expect(computeRoboAction({ ...base, fearAndGreed: 100 }).targetLtv).toBeCloseTo(0.15);
  });
  it('continuous horizon 13 → 52 weeks', () => {
    expect(dynamicHorizonWeeks(0)).toBe(13);
    expect(dynamicHorizonWeeks(40)).toBe(29);
    expect(dynamicHorizonWeeks(100)).toBe(52);
    expect(computeRoboAction({ ...base, fearAndGreed: 100 }).weeklyDepositBtc).toBe(0);
  });
  it('weekly budget = remaining space / horizon × price × multiplier', () => {
    // space 0.1 BTC, F&G 40 → 29 weeks, multiplier 3.5×0.6 = 2.1
    const r = computeRoboAction(base);
    expect(r.baseWeeklyUsd).toBeCloseTo(0.1 / 29 * 100000);
    expect(r.weeklyBudgetUsd).toBeCloseTo(0.1 / 29 * 100000 * 2.1);
    expect(r.weeklyDepositBtc).toBeCloseTo(0.1 / 29 * 2.1);
  });
  it('circuit breaker blocks new borrowing', () => {
    const r = computeRoboAction({ ...base, currentDebt: 0, borrowApy: 9 });
    expect(r.breaker.active).toBe(true);
    expect(r.borrowDelta).toBe(0);
  });
  it('borrow delta = 25000*0.24-1000 → accumulate E', () => {
    const r = computeRoboAction({ ...base, currentDebt: 1000 });
    expect(r.borrowDelta).toBeCloseTo((15000 + r.depositToCollateral) * 0.24 - 1000);
    expect(r.state).toBe('E');
  });
  it('high debt → deleverage C', () => {
    expect(computeRoboAction({ ...base, currentDebt: 9000 }).state).toBe('C');
  });
});

import { ETH_ROBO, fgMultiplier, targetLtvEth } from './roboAdvisorEngine';
describe('ETH robo profile', () => {
  const base = { totalBtc: 10, currentDepositedWbtc: 1, currentDebt: 0, weeklyBudget: 0, fearAndGreed: 50, borrowApy: 4, btcPrice: 3000 };
  it('targets 18% LTV at neutral F&G', () => {
    expect(computeRoboAction({ ...base, ...ETH_ROBO }).targetLtv).toBeCloseTo(0.18, 6);
  });
  it('splits Layer 5 into 29/60/11', () => {
    const r = computeRoboAction({ ...base, ...ETH_ROBO });
    expect([r.usdcSupplyRatio, r.cbBtcRatio, r.cashRatio]).toEqual([0.29, 0.6, 0.11]);
  });
  it('auto-repays from 25% back to 18%', () => {
    const r = computeRoboAction({ ...base, ...ETH_ROBO, currentDebt: 780 }); // 26% of $3000
    expect(r.autoRepayUsd).toBeCloseTo(780 - 3000 * 0.18, 6);
    expect(computeRoboAction({ ...base, ...ETH_ROBO, currentDebt: 690 }).autoRepayUsd).toBe(0);
  });
  it('ETH multiplier ceiling 4.5×, BTC 3.5×', () => {
    expect(fgMultiplier(0)).toBeCloseTo(3.5);
    expect(fgMultiplier(0, ETH_ROBO.fgMaxMultiplier)).toBeCloseTo(4.5);
    const r = computeRoboAction({ ...base, ...ETH_ROBO, fearAndGreed: 40 });
    expect(r.multiplier).toBeCloseTo(2.7);
    expect(r.weeklyBudgetUsd).toBeCloseTo((1.5 / 29) * 3000 * 2.7);
  });
  it('ETH target LTV 21% / 18% / 15%', () => {
    expect(targetLtvEth(0)).toBeCloseTo(0.21);
    expect(targetLtvEth(50)).toBeCloseTo(0.18);
    expect(targetLtvEth(100)).toBeCloseTo(0.15);
    expect(computeRoboAction({ ...base, ...ETH_ROBO, fearAndGreed: 0 }).targetLtv).toBeCloseTo(0.21);
  });
  it('auto-repay triggers at exactly 25% LTV', () => {
    const r = computeRoboAction({ ...base, ...ETH_ROBO, currentDebt: 750 });
    expect(r.autoRepayUsd).toBeCloseTo(750 - 3000 * 0.18, 6);
    expect(computeRoboAction({ ...base, ...ETH_ROBO, currentDebt: 749 }).autoRepayUsd).toBe(0);
  });
});

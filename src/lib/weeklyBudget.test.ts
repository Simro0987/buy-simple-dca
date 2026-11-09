import { describe, it, expect } from 'vitest';
import { weeklyBudget } from './weeklyBudget';
describe('weeklyBudget', () => {
  it('takes 10% of free balance', () => expect(weeklyBudget(800, 0).amount).toBe(80));
  it('caps at 200', () => expect(weeklyBudget(5000, 0).amount).toBe(200));
  it('falls back to 0.5% of portfolio', () => expect(weeklyBudget(0, 20000)).toEqual({ amount: 100, source: 'portfolio' }));
});

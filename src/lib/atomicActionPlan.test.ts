import { describe, expect, it } from 'vitest';
import {
  countActiveBatchTransactions,
  formatAtomicCopyText,
  hasEnoughGasForBatch,
} from '@/lib/atomicActionPlan';

describe('atomicActionPlan', () => {
  it('formats copy text with token and USD', () => {
    expect(formatAtomicCopyText(100.5, 'USDC', 100.5, 2)).toBe('100.50 USDC ($100.50)');
  });

  it('counts active batch transactions', () => {
    expect(countActiveBatchTransactions({
      depositQty: 1,
      borrowUsd: 500,
      reserveUsd: 150,
      yieldUsd: 200,
      growthUsd: 150,
    })).toBe(5);
  });

  it('blocks batch when gas is insufficient', () => {
    expect(hasEnoughGasForBatch(0.004, 3)).toBe(false);
    expect(hasEnoughGasForBatch(0.01, 3)).toBe(true);
  });
});

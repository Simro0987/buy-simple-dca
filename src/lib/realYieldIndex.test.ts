import { describe, it, expect } from 'vitest';
import {
  realYieldIndex,
  ryiAllocationShiftPp,
  RYI_SHIFT_PP_PER_PCT,
} from './realYieldIndex';

describe('realYieldIndex', () => {
  it('computes RYI = APY − inflation', () => {
    expect(realYieldIndex({ grossApyPct: 8, inflationPct: 3 })).toBe(5);
    expect(realYieldIndex({ grossApyPct: 3.5, inflationPct: 0.5 })).toBe(3);
  });

  it('can be negative when inflation exceeds APY', () => {
    expect(realYieldIndex({ grossApyPct: 2, inflationPct: 5 })).toBe(-3);
  });
});

describe('ryiAllocationShiftPp', () => {
  it('shifts 2 pp per 1% RYI difference', () => {
    expect(ryiAllocationShiftPp(4, 3)).toBe(1 * RYI_SHIFT_PP_PER_PCT); // +2 pp toward ETH
  });

  it('shifts 10 pp for a 5% difference', () => {
    expect(ryiAllocationShiftPp(2, 7)).toBe(-5 * RYI_SHIFT_PP_PER_PCT); // −10 pp → toward SOL
  });

  it('is zero when RYI is equal', () => {
    expect(ryiAllocationShiftPp(3, 3)).toBe(0);
  });

  it('is signed toward the higher-yield token', () => {
    expect(ryiAllocationShiftPp(5, 3)).toBeGreaterThan(0); // ETH higher → toward ETH
    expect(ryiAllocationShiftPp(3, 5)).toBeLessThan(0);    // SOL higher → toward SOL
  });
});

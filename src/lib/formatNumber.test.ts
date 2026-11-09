import { describe, it, expect } from 'vitest';
import { fmtQty, fmtUsd0, fmtInd } from './formatNumber';
describe('formatNumber', () => {
  it('caps crypto at 4 decimals', () => {
    expect(fmtQty(0.07962278068393423)).toBe('0.0796');
    expect(fmtQty(0.002003508218959495)).toBe('0.0020');
    expect(fmtQty(1, 8)).toBe('1.0000');
  });
  it('prices whole dollars, indicators max 4', () => {
    expect(fmtUsd0(76098.4).replace(/\s/g, ' ')).toBe('$76 098');
    expect(fmtInd(0.015612, 9)).toBe('0.0156');
  });
});

import { describe, expect, it } from 'vitest';
import { isFlashAlert } from '@/lib/overviewNews';
describe('overviewNews', () => {
  it('isFlashAlert detects high upvotes', () => {
    expect(isFlashAlert({ title: 'Market update', upvotes: 25 })).toBe(true);
    expect(isFlashAlert({ title: 'Market update', upvotes: 10 })).toBe(false);
  });

  it('isFlashAlert detects breaking category', () => {
    expect(isFlashAlert({ title: 'Update', categories: 'BTC, breaking' })).toBe(true);
  });

  it('isFlashAlert detects flash keywords in title', () => {
    expect(isFlashAlert({ title: 'Breaking: SEC approves ETF' })).toBe(true);
    expect(isFlashAlert({ title: 'Flash Alert — major exploit' })).toBe(true);
    expect(isFlashAlert({ title: 'Weekly recap' })).toBe(false);
  });
});

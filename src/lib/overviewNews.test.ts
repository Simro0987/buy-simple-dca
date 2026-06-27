import { describe, expect, it } from 'vitest';
import {
  isFlashAlert,
  pickTopStory,
  splitTopStory,
  type OverviewNewsItem,
} from '@/lib/overviewNews';

function article(overrides: Partial<OverviewNewsItem> & Pick<OverviewNewsItem, 'id' | 'title'>): OverviewNewsItem {
  return {
    asset: 'BTC',
    isFlashAlert: false,
    source: 'Test',
    publishedAt: new Date().toISOString(),
    articleUrl: 'https://example.com',
    ...overrides,
  };
}

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

  it('pickTopStory prefers highest engagement in last 24h', () => {
    const items = [
      article({ id: '1', title: 'Quiet update', upvotes: 5 }),
      article({ id: '2', title: 'Viral story', upvotes: 42 }),
      article({ id: '3', title: 'Breaking news', isFlashAlert: true }),
    ];
    expect(pickTopStory(items)?.id).toBe('2');
  });

  it('pickTopStory falls back to breaking when no engagement', () => {
    const items = [
      article({ id: '1', title: 'Older story', publishedAt: new Date(Date.now() - 3600000).toISOString() }),
      article({ id: '2', title: 'Breaking: ETF', isFlashAlert: true, publishedAt: new Date(Date.now() - 7200000).toISOString() }),
    ];
    expect(pickTopStory(items)?.id).toBe('2');
  });

  it('pickTopStory falls back to newest article', () => {
    const items = [
      article({ id: '1', title: 'Older', publishedAt: new Date(Date.now() - 7200000).toISOString() }),
      article({ id: '2', title: 'Newest', publishedAt: new Date(Date.now() - 600000).toISOString() }),
    ];
    expect(pickTopStory(items)?.id).toBe('2');
  });

  it('splitTopStory removes top story from remaining list', () => {
    const items = [
      article({ id: '1', title: 'A', upvotes: 10 }),
      article({ id: '2', title: 'B', upvotes: 30 }),
      article({ id: '3', title: 'C', upvotes: 5 }),
    ];
    const { topStory, remainingArticles } = splitTopStory(items);
    expect(topStory?.id).toBe('2');
    expect(remainingArticles.map(i => i.id)).toEqual(['1', '3']);
  });
});

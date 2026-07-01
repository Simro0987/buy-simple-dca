import { describe, expect, it } from 'vitest';
import { buildPollinationsImageUrl, getSourceFaviconUrl } from '@/lib/newsMedia';

describe('newsMedia', () => {
  it('buildPollinationsImageUrl encodes title into pollinations prompt', () => {
    const url = buildPollinationsImageUrl('Bitcoin surges');
    expect(url).toContain('image.pollinations.ai/prompt/');
    expect(url).toContain('width=400');
    expect(url).toContain('height=250');
    expect(url).toContain('nologo=true');
    expect(decodeURIComponent(url)).toContain('Bitcoin surges cryptocurrency');
  });

  it('getSourceFaviconUrl extracts domain from article URL', () => {
    expect(getSourceFaviconUrl('https://www.coindesk.com/markets/btc'))
      .toBe('https://www.google.com/s2/favicons?domain=www.coindesk.com&sz=64');
  });

  it('getSourceFaviconUrl returns null for invalid URLs', () => {
    expect(getSourceFaviconUrl('not-a-url')).toBeNull();
  });
});

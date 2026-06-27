import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearNewsTranslationCache, translateToSlovak } from '@/lib/newsTranslate';

describe('newsTranslate', () => {
  afterEach(() => {
    clearNewsTranslationCache();
    vi.restoreAllMocks();
  });

  it('translateToSlovak returns translated text from Google response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[['Bitcoin stúpa', 'Bitcoin', null, null, 10]], null, 'en'],
    }));

    await expect(translateToSlovak('Bitcoin rises')).resolves.toBe('Bitcoin stúpa');
  });

  it('translateToSlovak falls back to original text on failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')));

    await expect(translateToSlovak('Hello world')).resolves.toBe('Hello world');
  });

  it('translateToSlovak uses in-memory cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[['Ahoj', 'Hello', null, null, 5]], null, 'en'],
    });
    vi.stubGlobal('fetch', fetchMock);

    await translateToSlovak('Hello');
    await translateToSlovak('Hello');

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

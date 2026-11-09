import { describe, it, expect } from 'vitest';
import { fetchAndAverage } from './oracleRegistry';

describe('fetchAndAverage', () => {
  it('averages only valid, positive results', async () => {
    const r = await fetchAndAverage([
      { name: 'a', fetch: async () => 100 },
      { name: 'b', fetch: async () => 200 },
      { name: 'zero', fetch: async () => 0 },
      { name: 'nan', fetch: async () => NaN },
      { name: 'fail', fetch: async () => { throw new Error('x'); } },
    ]);
    expect(r.value).toBe(150);
    expect(r.failed).toBe(3);
  });
  it('drops timed-out sources', async () => {
    const slow = { name: 's', fetch: (sig: AbortSignal) => new Promise<number>((_, rej) => sig.addEventListener('abort', () => rej(new Error('t')))) };
    const r = await fetchAndAverage([slow, { name: 'f', fetch: async () => 40 }], 20);
    expect(r.value).toBe(40);
  });
  it('returns null when all fail', async () => {
    expect((await fetchAndAverage([{ name: 'x', fetch: async () => -1 }])).value).toBeNull();
  });
});

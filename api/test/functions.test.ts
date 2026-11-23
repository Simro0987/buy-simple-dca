import { describe, expect, it } from 'vitest';
import { functionNames, getFunction, installDenoShim, invokeFunction, PUBLIC_FUNCTIONS, registerFunction } from '../src/functions';
import { FUNCTION_LOADERS } from '../src/functions.generated';

describe('edge function port (Deno shim)', () => {
  it('loads all 34 server functions and each registers a handler', async () => {
    installDenoShim({ API_URL: 'http://127.0.0.1:1', API_SERVICE_KEY: 'x', API_ANON_KEY: 'y' });
    const names = Object.keys(FUNCTION_LOADERS);
    expect(names).toHaveLength(34);
    for (const n of names) await registerFunction(n, FUNCTION_LOADERS[n]);
    expect(functionNames()).toEqual([...names].sort());
    for (const p of PUBLIC_FUNCTIONS) expect(names).toContain(p);
  }, 60_000);

  it('answers CORS preflight and converts thrown errors to 500', async () => {
    const r = await invokeFunction('gas-prices', new Request('http://x/functions/v1/gas-prices', { method: 'OPTIONS' }));
    expect(r.status).toBeLessThan(300);
    await registerFunction('boom-test', async () => {
      (globalThis as unknown as { Deno: { serve: (h: () => never) => void } }).Deno.serve(() => {
        throw new Error('kaput');
      });
    });
    const e = await invokeFunction('boom-test', new Request('http://x', { method: 'POST' }));
    expect(e.status).toBe(500);
    expect(getFunction('nope')).toBeUndefined();
    expect((await invokeFunction('nope', new Request('http://x'))).status).toBe(404);
  });

  it('Deno.env only exposes the explicitly provided variables', () => {
    installDenoShim({ A: '1' });
    const D = (globalThis as unknown as { Deno: { env: { get: (k: string) => string | undefined } } }).Deno;
    expect(D.env.get('A')).toBe('1');
    expect(D.env.get('PATH')).toBeUndefined();
  });
});

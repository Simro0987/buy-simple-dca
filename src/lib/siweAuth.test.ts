import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseSiweMessage } from 'viem/siwe';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { hexToString, type Hex } from 'viem';

const { setSession } = vi.hoisted(() => ({ setSession: vi.fn(async (_s: unknown) => ({ error: null })) }));
vi.mock('@/lib/api/client', () => ({
  api: { auth: { setSession } },
  apiBaseUrl: () => `${window.location.origin}${window.__APP_CONFIG__?.VITE_API_URL ?? '/api'}`,
}));

import { buildSiweMessage, signInWithEthereum } from './siweAuth';

afterEach(() => {
  vi.unstubAllGlobals();
  window.__APP_CONFIG__ = undefined;
  setSession.mockClear();
});

describe('siweAuth', () => {
  it('builds an EIP-4361 message bound to this origin', () => {
    const m = parseSiweMessage(buildSiweMessage({ address: '0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe', chainId: 42161, nonce: 'abcdef123456' }));
    expect(m.domain).toBe(window.location.host);
    expect(m.uri).toBe(window.location.origin);
    expect(m.chainId).toBe(42161);
    expect(m.nonce).toBe('abcdef123456');
    expect(m.expirationTime!.getTime()).toBeGreaterThan(Date.now());
  });

  it('signs once with personal_sign and stores the session (relative /api URL)', async () => {
    window.__APP_CONFIG__ = { VITE_API_URL: '/api' };
    const acct = privateKeyToAccount(generatePrivateKey());
    const calls: string[] = [];
    const provider = {
      request: async ({ method, params }: { method: string; params?: unknown }) => {
        calls.push(method);
        if (method === 'eth_accounts') return [acct.address];
        if (method === 'eth_chainId') return '0x1';
        if (method === 'personal_sign') return acct.signMessage({ message: hexToString((params as [Hex])[0]) });
        throw new Error(`unexpected ${method}`);
      },
    };
    const urls: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      urls.push(url);
      if (url.endsWith('/siwe/nonce')) return new Response(JSON.stringify({ nonce: 'n0nce12345678' }));
      const body = JSON.parse(String(init?.body));
      expect(parseSiweMessage(body.message).address).toBe(acct.address);
      return new Response(JSON.stringify({ access_token: 'a', refresh_token: 'r' }));
    });
    expect(await signInWithEthereum(provider)).toBe(acct.address);
    expect(calls).toEqual(['eth_accounts', 'eth_chainId', 'personal_sign']);
    expect(urls[0]).toBe(`${window.location.origin}/api/auth/v1/siwe/nonce`);
    expect(setSession).toHaveBeenCalledWith({ access_token: 'a', refresh_token: 'r' });
  });

  it('surfaces API errors and never stores a session on failure', async () => {
    const provider = { request: async ({ method }: { method: string }) => (method === 'eth_chainId' ? '0x1' : method === 'personal_sign' ? '0x12' : ['0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe']) };
    vi.stubGlobal('fetch', async (url: string) =>
      url.endsWith('/nonce') ? new Response(JSON.stringify({ nonce: 'n0nce12345678' })) : new Response(JSON.stringify({ msg: 'invalid signature' }), { status: 401 }),
    );
    await expect(signInWithEthereum(provider)).rejects.toThrow('invalid signature');
    expect(setSession).not.toHaveBeenCalled();
  });
});

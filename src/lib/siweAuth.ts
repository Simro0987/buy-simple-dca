/**
 * Sign-In with Ethereum (EIP-4361) against the own API (Flux component "api").
 * Works with an injected wallet (MetaMask, Rabby, ...) and with Safe{Wallet} over WalletConnect:
 * a Safe signs off-chain (owners co-sign up to the threshold) and the API verifies it via EIP-1271.
 * The resulting session is stored by the own API client (src/lib/api/core.ts).
 * Signing a SIWE message never moves funds and never sends a transaction.
 */
import { getAddress, toHex } from 'viem';
import { createSiweMessage } from 'viem/siwe';
import { api, apiBaseUrl } from '@/lib/api/client';

export interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

const apiBase = apiBaseUrl;

export function getInjectedProvider(): Eip1193Provider | null {
  const eth = (window as unknown as { ethereum?: Eip1193Provider }).ethereum;
  return eth && typeof eth.request === 'function' ? eth : null;
}

async function readError(res: Response): Promise<string> {
  try {
    const j = await res.json();
    return j.msg || j.error_description || j.message || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Builds the SIWE message for this origin (exported for tests). */
export function buildSiweMessage(p: { address: string; chainId: number; nonce: string; now?: Date }): string {
  const now = p.now ?? new Date();
  return createSiweMessage({
    domain: window.location.host,
    uri: window.location.origin,
    address: getAddress(p.address),
    chainId: p.chainId,
    nonce: p.nonce,
    version: '1',
    statement: 'Prihlásenie do buy-simple-dca. Tento podpis nič neodosiela a nemá prístup k prostriedkom.',
    issuedAt: now,
    expirationTime: new Date(now.getTime() + 25 * 60_000),
  });
}

/**
 * Asks the wallet for one signature and exchanges it for a session.
 * `expectedAddress` (e.g. the connected Safe) pins which account must sign.
 */
export async function signInWithEthereum(provider: Eip1193Provider, expectedAddress?: string): Promise<string> {
  let accounts = (await provider.request({ method: 'eth_accounts' }).catch(() => [])) as string[];
  if (!accounts?.length) accounts = (await provider.request({ method: 'eth_requestAccounts' })) as string[];
  const address = expectedAddress ? getAddress(expectedAddress) : accounts?.[0] ? getAddress(accounts[0]) : null;
  if (!address) throw new Error('Peňaženka nevrátila žiadnu adresu');
  const chainId = Number(await provider.request({ method: 'eth_chainId' }));
  if (!Number.isFinite(chainId) || chainId <= 0) throw new Error('Neznáma sieť peňaženky');

  const base = apiBase();
  const nonceRes = await fetch(`${base}/auth/v1/siwe/nonce`, { cache: 'no-store' });
  if (!nonceRes.ok) throw new Error(await readError(nonceRes));
  const { nonce } = (await nonceRes.json()) as { nonce: string };

  const message = buildSiweMessage({ address, chainId, nonce });
  const signature = (await provider.request({ method: 'personal_sign', params: [toHex(message), address] })) as string;
  if (!signature || signature === '0x') throw new Error('Podpis nebol dokončený');

  const res = await fetch(`${base}/auth/v1/siwe/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message, signature }),
  });
  if (!res.ok) throw new Error(await readError(res));
  const s = (await res.json()) as { access_token: string; refresh_token: string };
  const { error } = await api.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
  if (error) throw error;
  return address;
}

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  decodeAbiAddressArray,
  isForbiddenAgentMethod,
  verifySafeContractOnChain,
  validateAgentTransactionWithSafeGuard,
  SAFE_GUARD_STORAGE_SLOT,
} from './safeWalletGuard';

const SAFE = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
const OWNER_A = '0x1111111111111111111111111111111111111111';
const OWNER_B = '0x2222222222222222222222222222222222222222';

const word = (hex: string) => hex.replace(/^0x/, '').padStart(64, '0');
const encodeAddressArray = (addrs: string[]) =>
  '0x' + word('20') + word(addrs.length.toString(16)) + addrs.map((a) => word(a.slice(2))).join('');

function mockRpc(handler: (method: string, params: unknown[]) => string | Error) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    const body = JSON.parse(String((init as RequestInit).body));
    const out = handler(body.method, body.params);
    if (out instanceof Error) throw out;
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: out }), { status: 200 });
  });
}

afterEach(() => vi.restoreAllMocks());

describe('Safe on-chain verification (fail-closed)', () => {
  it('decodes address[]', () => {
    expect(decodeAbiAddressArray(encodeAddressArray([OWNER_A, OWNER_B]))).toEqual([OWNER_A, OWNER_B]);
  });

  it('accepts a real-looking Safe and reads guard + modules', () => {
    mockRpc((method, params) => {
      if (method === 'eth_getCode') return '0x6080604052';
      if (method === 'eth_getStorageAt') {
        expect((params as string[])[1]).toBe(SAFE_GUARD_STORAGE_SLOT);
        return '0x' + word('0');
      }
      const data = (params as { data: string }[])[0].data;
      if (data === '0xe75235b8') return '0x' + word('2');
      if (data === '0xa0e67e2b') return encodeAddressArray([OWNER_A, OWNER_B]);
      if (data.startsWith('0xcc2f8452')) return '0x' + word('40') + word('1') + word('0') + word('0');
      return '0x';
    });
    return verifySafeContractOnChain(`arb1:${SAFE}`).then((r) => {
      expect(r.isSafeContract).toBe(true);
      expect(r.threshold).toBe(2);
      expect(r.owners).toEqual([OWNER_A, OWNER_B]);
      expect(r.guard).toBeNull();
      expect(r.modules).toEqual([]);
    });
  });

  it('rejects when the RPC fails (used to accept any address)', async () => {
    mockRpc(() => new Error('network down'));
    const r = await verifySafeContractOnChain(SAFE, 'arbitrum');
    expect(r.isSafeContract).toBe(false);
  });

  it('rejects EOAs and non-Safe contracts', async () => {
    mockRpc(() => '0x');
    expect((await verifySafeContractOnChain(SAFE, 'arbitrum')).isSafeContract).toBe(false);
    vi.restoreAllMocks();
    mockRpc((method) => (method === 'eth_getCode' ? '0x60806040' : '0x' + word('1')));
    expect((await verifySafeContractOnChain(SAFE, 'arbitrum')).isSafeContract).toBe(false);
  });

  it('rejects non-EVM chains for Safe verification', async () => {
    expect((await verifySafeContractOnChain(SAFE, 'bitcoin')).isSafeContract).toBe(false);
  });
});

describe('off-chain agent policy hardening', () => {
  it('catches transfer variants regardless of formatting', () => {
    for (const m of ['transfer', ' Transfer(address,uint256)', 'safeTransferFrom', 'permit', 'setApprovalForAll', 'execTransaction', 'multiSend', 'withdrawTo', 'bridgeTo']) {
      expect(isForbiddenAgentMethod(m)).toBe(true);
    }
    expect(isForbiddenAgentMethod('exactInputSingle')).toBe(false);
  });

  it('fails closed on invalid amounts / unknown portfolio value', () => {
    const tx = {
      agentId: 'a', agentName: 'a', action: 'SWAP' as const, chain: 'arbitrum' as const,
      fromToken: 'USDC', toToken: 'WBTC', amountUsd: Number.NaN, recipientAddress: SAFE, protocol: 'Uniswap',
    };
    expect(validateAgentTransactionWithSafeGuard(tx, SAFE).allowed).toBe(false);
    expect(validateAgentTransactionWithSafeGuard({ ...tx, amountUsd: 10 }, SAFE, undefined, 0).allowed).toBe(false);
    expect(validateAgentTransactionWithSafeGuard({ ...tx, amountUsd: 10 }, SAFE).allowed).toBe(true);
  });
});

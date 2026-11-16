import { decodeFunctionData, parseAbi } from 'viem';
import { describe, expect, it } from 'vitest';
import { buildSafeBatch } from '../scripts/safe-tx-builder';

const SAFE = '0x5afe000000000000000000000000000000000001';
const MOD = '0x0d00000000000000000000000000000000000002';
const T1 = '0x0000000000000000000000000000000000000ac1';
const T2 = '0x0000000000000000000000000000000000000bc2';
const F = '0x00000000000000000000000000000000000000f1';

describe('Safe Transaction Builder batch', () => {
  it('enableModule on the Safe, then setToken/setPool on the module', () => {
    const b = buildSafeBatch({ chainId: 421614, safe: SAFE, module: MOD, tokens: [{ token: T1, usdFeed: F }, { token: T2, usdFeed: F }], pools: [{ tokenIn: T1, tokenOut: T2, fee: 500 }] }, 0);
    expect(b.transactions).toHaveLength(4);
    expect(b.transactions[0].to.toLowerCase()).toBe(SAFE);
    const d0 = decodeFunctionData({ abi: parseAbi(['function enableModule(address)']), data: b.transactions[0].data });
    expect(String(d0.args[0]).toLowerCase()).toBe(MOD);
    expect(b.transactions.slice(1).every((t) => t.to.toLowerCase() === MOD && t.value === '0')).toBe(true);
    expect(() => buildSafeBatch({ chainId: 1, safe: SAFE, module: MOD, tokens: [], pools: [{ tokenIn: T1, tokenOut: T2, fee: 7 }] })).toThrow();
  });
});

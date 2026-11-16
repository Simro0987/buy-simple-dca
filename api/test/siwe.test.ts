import { describe, expect, it } from 'vitest';
import { hashMessage } from 'viem';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { SiweAuth } from '../src/auth';

const SAFE = '0x5afe5afe5afe5afe5afe5afe5afe5afe5afe5afe';
const noDb = { query: async () => ({ rows: [], rowCount: 0 }) };

describe('SIWE signature checks', () => {
  it('accepts an EOA signature locally and rejects another signer', async () => {
    const a = privateKeyToAccount(generatePrivateKey());
    const b = privateKeyToAccount(generatePrivateKey());
    const auth = new SiweAuth({ db: noDb, jwtSecret: 'x'.repeat(40), accessTtlSec: 60, refreshTtlSec: 60, siweDomains: [], erc1271: async () => false });
    const msg = 'hello';
    expect(await auth.checkSignature(1, a.address, msg, await a.signMessage({ message: msg }))).toBe(true);
    expect(await auth.checkSignature(1, a.address, msg, await b.signMessage({ message: msg }))).toBe(false);
  });

  it('falls back to EIP-1271 for Safe / smart accounts with the EIP-191 message hash', async () => {
    const seen: unknown[] = [];
    const auth = new SiweAuth({
      db: noDb,
      jwtSecret: 'x'.repeat(40),
      accessTtlSec: 60,
      refreshTtlSec: 60,
      siweDomains: [],
      erc1271: async (chainId, account, hash, sig) => {
        seen.push([chainId, account, hash, sig]);
        return sig === '0xabcd';
      },
    });
    expect(await auth.checkSignature(42161, SAFE, 'm', '0xabcd')).toBe(true);
    expect(seen[0]).toEqual([42161, SAFE, hashMessage('m'), '0xabcd']);
    expect(await auth.checkSignature(42161, SAFE, 'm', '0xdead')).toBe(false);
  });

  it('rejects malformed input before touching the database', async () => {
    const auth = new SiweAuth({ db: noDb, jwtSecret: 'x'.repeat(40), accessTtlSec: 60, refreshTtlSec: 60, siweDomains: ['a.example'], erc1271: async () => true });
    await expect(auth.verify('not a siwe message', '0x00')).rejects.toMatchObject({ status: 400 });
    await expect(auth.verify('x', 'not-hex')).rejects.toMatchObject({ status: 400 });
  });
});

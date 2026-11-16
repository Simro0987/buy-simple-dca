import { describe, expect, it } from 'vitest';
import { redact, safeError } from '../src/log';

const PK = '0x' + '1f'.repeat(32);

describe('log redaction', () => {
  it('redacts private keys anywhere but keeps tx hashes and token addresses', () => {
    const out = redact({ msg: `key ${PK}`, privateKey: 'x', statusToken: 'y', txHash: PK, tokenIn: '0xabc' }) as Record<string, string>;
    expect(out.msg).not.toContain('1f1f');
    expect(out.privateKey).toBe('[REDACTED]');
    expect(out.statusToken).toBe('[REDACTED]');
    expect(out.txHash).toBe(PK);
    expect(out.tokenIn).toBe('0xabc');
  });
  it('safeError strips RPC URLs (API keys) and secrets', () => {
    const e = new Error(`HTTP request failed.\n\nURL: https://arb-sepolia.g.alchemy.com/v2/SUPERSECRETKEY\nbody ${PK}`);
    const s = safeError(e);
    expect(s).not.toContain('SUPERSECRETKEY');
    expect(s).not.toContain('1f1f');
    expect(s).toContain('<url>');
  });
});

import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';

const AG = JSON.stringify([
  { id: 'btcdca', module: '0x0d00000000000000000000000000000000000002', tokenIn: '0x0000000000000000000000000000000000000ac1', tokenOut: '0x0000000000000000000000000000000000000bc2', fee: 500, amountUsd: 25 },
]);
const KEY = '0x' + '22'.repeat(32);
const base = { SAFE_ADDRESS: '0x5afe000000000000000000000000000000000001', AGENTS: AG, AGENT_BTCDCA_PRIVATE_KEY: KEY };

describe('loadConfig', () => {
  it('defaults: Arbitrum Sepolia testnet, DRY_RUN on, kill switch off', () => {
    const c = loadConfig({ ...base });
    expect(c.network.key).toBe('arbitrum-sepolia');
    expect(c.network.testnet).toBe(true);
    expect(c.dryRun).toBe(true);
    expect(c.killSwitch).toBe(false);
    expect(c.agents[0].intervalMinutes).toBe(10080);
  });

  it('refuses mainnet unless ALLOW_MAINNET=true', () => {
    expect(() => loadConfig({ ...base, NETWORK: 'arbitrum' })).toThrow(/ALLOW_MAINNET/);
    expect(loadConfig({ ...base, NETWORK: 'arbitrum', ALLOW_MAINNET: 'true' }).network.testnet).toBe(false);
  });

  it('requires a key per enabled agent, supports *_FILE, rejects malformed keys', () => {
    expect(loadConfig({ ...base, AGENT_BTCDCA_PRIVATE_KEY: '' }).agents[0].privateKey).toBeNull();
    expect(loadConfig({ ...base, AGENT_BTCDCA_PRIVATE_KEY: '', AGENT_BTCDCA_PRIVATE_KEY_FILE: '/nope' }, () => { throw new Error('ENOENT'); }).agents[0].privateKey).toBeNull();
    expect(() => loadConfig({ ...base, AGENT_BTCDCA_PRIVATE_KEY: '0x1234' })).toThrow(/32-byte/);
    const c = loadConfig({ ...base, AGENT_BTCDCA_PRIVATE_KEY: '', AGENT_BTCDCA_PRIVATE_KEY_FILE: '/k' }, () => KEY + '\n');
    expect(c.agents[0].privateKey).toBe(KEY);
  });

  it('validates agents JSON strictly', () => {
    expect(() => loadConfig({ ...base, AGENTS: '{bad' })).toThrow(/JSON/);
    expect(() => loadConfig({ ...base, AGENTS: JSON.stringify([{ ...JSON.parse(AG)[0], fee: 123 }]) })).toThrow(/fee/);
    expect(() => loadConfig({ ...base, AGENTS: JSON.stringify([{ ...JSON.parse(AG)[0], maxSlippageBps: 900 }]) })).toThrow();
    expect(() => loadConfig({ ...base, SAFE_ADDRESS: 'nope' })).toThrow(/SAFE_ADDRESS/);
  });
});

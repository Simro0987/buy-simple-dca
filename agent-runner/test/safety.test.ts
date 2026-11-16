import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AGENT_MODULE_ABI } from '../src/abi';
import { redact } from '../src/log';

const SRC = join(__dirname, '..', 'src');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = readdirSync(SRC).map((f) => stripComments(readFileSync(join(SRC, f), 'utf8'))).join('\n');

describe('no code path can move funds elsewhere', () => {
  it('the only writable ABI functions are swapExactInputSingle and pause', () => {
    const writes = AGENT_MODULE_ABI.filter((f) => f.type === 'function' && f.stateMutability === 'nonpayable').map((f) => f.name);
    expect(writes.sort()).toEqual(['pause', 'swapExactInputSingle']);
  });

  it('source never sends raw transactions, transfers or Safe execs', () => {
    for (const forbidden of ['sendTransaction', 'sendRawTransaction', "'transfer'", '"transfer"', 'transferFrom', 'execTransaction', 'signTransaction', 'deployContract']) {
      expect(code.includes(forbidden), forbidden).toBe(false);
    }
  });

  it('logger redacts private keys', () => {
    const k = '0x' + 'ab'.repeat(32);
    expect(JSON.stringify(redact({ msg: `key ${k}`, privateKey: 'x' }))).not.toContain('ab'.repeat(32));
  });
});

describe('viem executor is bound to one module', () => {
  it('every simulated call targets the module with swapExactInputSingle / pause only', async () => {
    const { createViemExecutor } = await import('../src/chain');
    const { NETWORKS } = await import('../src/networks');
    const calls: { address: string; functionName: string }[] = [];
    const fakeClient = {
      simulateContract: async (req: { address: string; functionName: string }) => {
        calls.push({ address: req.address, functionName: req.functionName });
        throw new Error('stop before signing');
      },
    } as never;
    const MODULE = '0x0d00000000000000000000000000000000000002';
    const ex = createViemExecutor(NETWORKS['arbitrum-sepolia'], 'http://127.0.0.1:1', ('0x' + '33'.repeat(32)) as `0x${string}`, MODULE, fakeClient);
    const args = { tokenIn: MODULE, tokenOut: MODULE, fee: 500, amountIn: 1n, amountOutMinimum: 1n } as const;
    await expect(ex.simulateSwap(args)).rejects.toThrow();
    await expect(ex.sendSwap(args)).rejects.toThrow();
    await expect(ex.pauseModule()).rejects.toThrow();
    expect(calls.every((c) => c.address === MODULE)).toBe(true);
    expect(calls.map((c) => c.functionName)).toEqual(['swapExactInputSingle', 'swapExactInputSingle', 'pause']);
    expect(Object.keys(ex).sort()).toEqual(['agentAddress', 'module', 'pauseModule', 'sendSwap', 'simulateSwap', 'waitForReceipt']);
  });
});

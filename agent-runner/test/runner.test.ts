import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { agentSpec, FakeChain, makeConfig, makeRunner, NOW, AGENT_ADDR, WBTC, USDC } from './helpers';

describe('AgentRunner', () => {
  it('dry-run: simulates via the module, never sends, records the plan', async () => {
    const { runner, ex, state } = makeRunner();
    const rec = await runner.runAgent(makeConfig().agents[0]);
    expect(rec?.status).toBe('dry-run');
    expect(ex.sent).toHaveLength(0);
    expect(ex.simulated).toHaveLength(1);
    const a = ex.simulated[0];
    expect(a.tokenIn.toLowerCase()).toBe(USDC.toLowerCase());
    expect(a.tokenOut.toLowerCase()).toBe(WBTC.toLowerCase());
    expect(a.amountIn).toBe(25_000_000n); // $25 of USDC (6 dec)
    // $25 / $100k = 25_000 sats, minus 0.5 % slippage
    expect(a.amountOutMinimum).toBe(24_875n);
    expect(state.get().trades[0].status).toBe('dry-run');
  });

  it('live: sends exactly the module swap and records confirmation', async () => {
    const { runner, ex, state } = makeRunner({ config: makeConfig({ dryRun: false }) });
    const rec = await runner.runAgent(makeConfig().agents[0]);
    expect(rec?.status).toBe('confirmed');
    expect(ex.sent).toHaveLength(1);
    expect(Object.keys(ex.sent[0]).sort()).toEqual(['amountIn', 'amountOutMinimum', 'fee', 'tokenIn', 'tokenOut']);
    expect(state.agent('btcdca').totals.trades).toBe(1);
  });

  it('clamps to the on-chain per-swap limit (with headroom)', async () => {
    const cfg = makeConfig({}, [agentSpec({ amountUsd: 5000 })]);
    const { runner, ex } = makeRunner({ config: cfg });
    await runner.runAgent(cfg.agents[0]);
    expect(ex.simulated[0].amountIn).toBe(98_000_000n); // $100 * 98 %
  });

  it('never uses more slippage than the module allows', async () => {
    const cfg = makeConfig({}, [agentSpec({ maxSlippageBps: 500 })]);
    const { runner, ex } = makeRunner({ config: cfg }); // module max = 100 bps
    await runner.runAgent(cfg.agents[0]);
    expect(ex.simulated[0].amountOutMinimum).toBe(24_750n); // 1 %
  });

  it('env kill switch: no simulation, no trade', async () => {
    const { runner, ex } = makeRunner({ config: makeConfig({ killSwitch: true, dryRun: false }) });
    await runner.tick();
    expect(ex.simulated).toHaveLength(0);
    expect(ex.sent).toHaveLength(0);
    expect(ex.paused).toBe(0);
  });

  it('KILL file in the state volume stops trading and can pause on-chain', async () => {
    const cfg = makeConfig({ dryRun: false, killSwitchPauseOnchain: true });
    writeFileSync(join(cfg.stateDir, 'KILL'), '1');
    const { runner, ex } = makeRunner({ config: cfg });
    await runner.tick();
    await runner.tick();
    expect(ex.sent).toHaveLength(0);
    expect(ex.paused).toBe(1);
  });

  it('refuses to trade when the agent key is a Safe owner', async () => {
    const chain = new FakeChain();
    chain.owners = [AGENT_ADDR];
    const { runner, ex } = makeRunner({ chain, config: makeConfig({ dryRun: false }) });
    const rec = await runner.runAgent(makeConfig().agents[0]);
    expect(rec?.status).toBe('skipped');
    expect(rec?.reason).toMatch(/OWNER/);
    expect(ex.sent).toHaveLength(0);
  });

  it('refuses when the module is not enabled / bound to another agent / another Safe', async () => {
    for (const mutate of [
      (c: FakeChain) => { c.moduleEnabled = false; },
      (c: FakeChain) => { c.module.agent = '0x0000000000000000000000000000000000000bad'; },
      (c: FakeChain) => { c.module.safe = '0x0000000000000000000000000000000000000bad'; },
      (c: FakeChain) => { c.poolOk = false; },
    ]) {
      const chain = new FakeChain();
      mutate(chain);
      const { runner, ex } = makeRunner({ chain, config: makeConfig({ dryRun: false }) });
      const rec = await runner.runAgent(makeConfig().agents[0]);
      expect(rec?.status).toBe('skipped');
      expect(ex.sent).toHaveLength(0);
    }
  });

  it('skips on stale oracle, paused module, low balance, simulation revert', async () => {
    const cases: [string, (c: FakeChain, e: import('./helpers').FakeExecutor) => void, string][] = [
      ['stale', (c) => { Object.values(c.feeds)[1].updatedAt = BigInt(NOW - 200_000); }, 'skipped'],
      ['paused', (c) => { c.module.paused = true; }, 'skipped'],
      ['balance', (c) => { c.balance = 1n; }, 'skipped'],
      ['revert', (_c, e) => { e.simulateError = new Error('SlippageTooHigh'); }, 'error'],
    ];
    for (const [, mutate, expected] of cases) {
      const { runner, ex, chain } = makeRunner({ config: makeConfig({ dryRun: false }) });
      mutate(chain, ex);
      const rec = await runner.runAgent(makeConfig().agents[0]);
      expect(rec?.status).toBe(expected);
      expect(ex.sent).toHaveLength(0);
    }
  });

  it('uses the on-chain lastSwapAt as schedule (no duplicate buys after restart / multiple instances)', async () => {
    const chain = new FakeChain();
    chain.module.lastSwapAt = BigInt(NOW - 3600 * 24); // 1 day ago, interval = 7 days
    const { runner, ex } = makeRunner({ chain, config: makeConfig({ dryRun: false }) });
    const rec = await runner.runAgent(makeConfig().agents[0]);
    expect(rec).toBeUndefined();
    expect(ex.sent).toHaveLength(0);
  });

  it('respects the schedule after a run', async () => {
    const { runner, ex } = makeRunner();
    await runner.tick();
    await runner.tick();
    expect(ex.simulated).toHaveLength(1);
  });

  it('dca-brake-boost: STOP (overheated) buys nothing, DEEP_BOOST doubles (still capped on-chain)', async () => {
    const spec = agentSpec({ strategy: 'dca-brake-boost', indicatorSymbol: 'BTCUSDT', amountUsd: 40 });
    const hot = makeRunner({ config: makeConfig({}, [spec]), indicators: async () => ({ price: 150_000, rsi14: 85, ma200: 100_000 }) });
    const r1 = await hot.runner.runAgent(spec);
    expect(r1?.status).toBe('skipped');
    expect(hot.ex.simulated).toHaveLength(0);

    const cold = makeRunner({ config: makeConfig({}, [spec]), indicators: async () => ({ price: 70_000, rsi14: 25, ma200: 100_000 }) });
    await cold.runner.runAgent(spec);
    expect(cold.ex.simulated[0].amountIn).toBe(80_000_000n); // $80
  });

  it('status snapshot contains no private key', async () => {
    const { runner } = makeRunner();
    await runner.tick();
    const json = JSON.stringify(runner.status());
    expect(json).not.toContain('11'.repeat(32));
    expect(json).toContain('btcdca');
  });
});

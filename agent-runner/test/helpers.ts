import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Address, Hex } from 'viem';
import type { AgentExecutor, ChainReader, ModuleState, SwapArgs, TokenConfig } from '../src/chain';
import type { LoadedAgent, RunnerConfig } from '../src/config';
import { NETWORKS } from '../src/networks';
import { AgentRunner } from '../src/runner';
import { StateStore } from '../src/state';
import type { IndicatorSource } from '../src/strategies';

export const SAFE = '0x5afe000000000000000000000000000000000001' as Address;
export const MODULE = '0x0d00000000000000000000000000000000000002' as Address;
export const AGENT_ADDR = '0xa9e0000000000000000000000000000000000003' as Address;
export const USDC = '0x0000000000000000000000000000000000000Ac1' as Address;
export const WBTC = '0x0000000000000000000000000000000000000Bc2' as Address;
export const FEED_USDC = '0x00000000000000000000000000000000000000f1' as Address;
export const FEED_BTC = '0x00000000000000000000000000000000000000f2' as Address;
export const OWNER = '0x0000000000000000000000000000000000000Aa1' as Address;
export const NOW = 1_800_000_000; // seconds

export function agentSpec(over: Partial<LoadedAgent> = {}): LoadedAgent {
  return {
    id: 'btcdca', name: 'BTC DCA', enabled: true, strategy: 'dca', module: MODULE, tokenIn: USDC, tokenOut: WBTC,
    fee: 500, amountUsd: 25, intervalMinutes: 60 * 24 * 7, maxSlippageBps: 50,
    privateKey: ('0x' + '11'.repeat(32)) as Hex, ...over,
  } as LoadedAgent;
}

export function makeConfig(over: Partial<RunnerConfig> = {}, agents = [agentSpec()]): RunnerConfig {
  return {
    network: NETWORKS['arbitrum-sepolia'], rpcUrl: 'http://rpc.invalid', safe: SAFE, dryRun: true,
    killSwitch: false, killSwitchPauseOnchain: false, allowMainnet: false,
    stateDir: mkdtempSync(join(tmpdir(), 'runner-')), statusPort: 0, tickSeconds: 60, agents, ...over,
  };
}

export class FakeChain implements ChainReader {
  module: ModuleState = {
    safe: SAFE, router: '0x68b3465833fb72A70ecDF485E0e4C7bD8665Fc45', agent: AGENT_ADDR, paused: false,
    perSwapLimitUsd: 100n * 10n ** 18n, dailyLimitUsd: 300n * 10n ** 18n, cooldownSeconds: 3600n,
    maxSlippageBps: 100n, maxOracleAge: 86_400n, lastSwapAt: 0n, currentDay: 0n, spentTodayUsd: 0n,
  };
  tokens: Record<string, TokenConfig> = {
    [USDC.toLowerCase()]: { allowed: true, tokenDecimals: 6, usdFeed: FEED_USDC },
    [WBTC.toLowerCase()]: { allowed: true, tokenDecimals: 8, usdFeed: FEED_BTC },
  };
  feeds: Record<string, { answer: bigint; decimals: number; updatedAt: bigint }> = {
    [FEED_USDC.toLowerCase()]: { answer: 100_000_000n, decimals: 8, updatedAt: BigInt(NOW - 60) },
    [FEED_BTC.toLowerCase()]: { answer: 100_000n * 100_000_000n, decimals: 8, updatedAt: BigInt(NOW - 60) },
  };
  poolOk = true;
  moduleEnabled = true;
  owners: Address[] = [OWNER];
  balance = 10_000n * 10n ** 6n;
  async now() { return BigInt(NOW); }
  async moduleState() { return { ...this.module }; }
  async tokenConfig(_m: Address, t: Address) { return this.tokens[t.toLowerCase()] ?? { allowed: false, tokenDecimals: 0, usdFeed: '0x0000000000000000000000000000000000000000' as Address }; }
  async poolAllowed() { return this.poolOk; }
  async feed(f: Address) { return this.feeds[f.toLowerCase()]; }
  async balanceOf() { return this.balance; }
  async safeOwners() { return this.owners; }
  async isModuleEnabled() { return this.moduleEnabled; }
}

export class FakeExecutor implements AgentExecutor {
  agentAddress = AGENT_ADDR;
  module = MODULE;
  simulated: SwapArgs[] = [];
  sent: SwapArgs[] = [];
  paused = 0;
  simulateError: Error | null = null;
  receiptStatus: 'success' | 'reverted' = 'success';
  async simulateSwap(a: SwapArgs) {
    if (this.simulateError) throw this.simulateError;
    this.simulated.push(a);
    return (a.amountOutMinimum * 101n) / 100n;
  }
  async sendSwap(a: SwapArgs) { this.sent.push(a); return ('0x' + 'ab'.repeat(32)) as Hex; }
  async pauseModule() { this.paused++; return ('0x' + 'cd'.repeat(32)) as Hex; }
  async waitForReceipt() { return { status: this.receiptStatus, blockNumber: 1n }; }
}

export function makeRunner(opts: { config?: RunnerConfig; chain?: FakeChain; ex?: FakeExecutor; indicators?: IndicatorSource } = {}) {
  const config = opts.config ?? makeConfig();
  const chain = opts.chain ?? new FakeChain();
  const ex = opts.ex ?? new FakeExecutor();
  const state = new StateStore(config.stateDir);
  const runner = new AgentRunner({
    config, reader: chain, executors: new Map([[config.agents[0].id, ex]]), state,
    indicators: opts.indicators ?? (async () => null), log: () => {}, nowMs: () => NOW * 1000,
  });
  return { runner, chain, ex, state, config };
}

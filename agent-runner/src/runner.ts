import { getAddress, type Address } from 'viem';
import type { AgentExecutor, ChainReader, ModuleState, TokenConfig } from './chain';
import type { LoadedAgent, RunnerConfig } from './config';
import { safeError, type Logger } from './log';
import { amountForUsd, fromUsd18, isStale, minAmountOut, price18, usd18 } from './quote';
import type { StateStore, TradeRecord } from './state';
import { decide, type IndicatorSource } from './strategies';

export interface Preflight {
  ok: boolean;
  problems: string[];
  checkedAt: string;
}

export interface RunnerDeps {
  config: RunnerConfig;
  reader: ChainReader;
  executors: Map<string, AgentExecutor>;
  state: StateStore;
  indicators: IndicatorSource;
  log: Logger;
  nowMs?: () => number;
}

const RETRY_MS = 15 * 60 * 1000;
/** Stay slightly under on-chain USD limits: prices move between our read and the tx. */
const LIMIT_HEADROOM_BPS = 9_800n;

const eq = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

export class AgentRunner {
  readonly startedAt = new Date().toISOString();
  private preflights = new Map<string, Preflight>();
  private pausedOnchain = new Set<string>();
  private running = false;

  constructor(private readonly d: RunnerDeps) {}

  private now(): number {
    return this.d.nowMs ? this.d.nowMs() : Date.now();
  }

  killActive(): boolean {
    return this.d.config.killSwitch || this.d.state.killFilePresent();
  }

  /** Verifies on-chain that the key/module/Safe wiring is exactly what we expect. */
  async preflight(agent: LoadedAgent): Promise<Preflight> {
    const problems: string[] = [];
    const ex = this.d.executors.get(agent.id);
    const { reader, config } = this.d;
    try {
      if (!ex) throw new Error('no executor (missing key)');
      if (!eq(ex.module, agent.module)) problems.push('executor bound to a different module');
      const m = await reader.moduleState(agent.module);
      if (!eq(m.agent, ex.agentAddress)) problems.push(`module.agent ${m.agent} != key address ${ex.agentAddress}`);
      if (!eq(m.safe, config.safe)) problems.push(`module.safe ${m.safe} != SAFE_ADDRESS ${config.safe}`);
      if (config.expectedRouter && !eq(m.router, config.expectedRouter)) problems.push(`module.router ${m.router} != EXPECTED_ROUTER`);
      if (!(await reader.isModuleEnabled(config.safe, agent.module))) problems.push('module is NOT enabled on the Safe');
      const owners = await reader.safeOwners(config.safe);
      if (owners.some((o) => eq(o, ex.agentAddress))) {
        problems.push('agent key is a Safe OWNER - refusing (agent keys must never be owners)');
      }
      const [cin, cout] = await Promise.all([
        reader.tokenConfig(agent.module, agent.tokenIn),
        reader.tokenConfig(agent.module, agent.tokenOut),
      ]);
      if (!cin.allowed) problems.push(`tokenIn ${agent.tokenIn} not allow-listed in module`);
      if (!cout.allowed) problems.push(`tokenOut ${agent.tokenOut} not allow-listed in module`);
      if (!(await reader.poolAllowed(agent.module, agent.tokenIn, agent.tokenOut, agent.fee))) {
        problems.push(`pool ${agent.tokenIn}->${agent.tokenOut} fee ${agent.fee} not allow-listed`);
      }
    } catch (e) {
      problems.push(`preflight error: ${safeError(e)}`);
    }
    const p = { ok: problems.length === 0, problems, checkedAt: new Date(this.now()).toISOString() };
    this.preflights.set(agent.id, p);
    return p;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const agent of this.d.config.agents) {
        if (!agent.enabled) continue;
        try {
          if (this.killActive()) {
            await this.handleKill(agent);
            continue;
          }
          await this.runAgent(agent);
        } catch (e) {
          this.d.log('error', 'agent tick failed', { agent: agent.id, error: safeError(e) });
        }
      }
    } finally {
      this.running = false;
    }
  }

  private async handleKill(agent: LoadedAgent): Promise<void> {
    const { config, log } = this.d;
    if (!config.killSwitchPauseOnchain || config.dryRun || this.pausedOnchain.has(agent.id)) return;
    const ex = this.d.executors.get(agent.id);
    if (!ex) return;
    const m = await this.d.reader.moduleState(agent.module);
    if (m.paused) {
      this.pausedOnchain.add(agent.id);
      return;
    }
    const hash = await ex.pauseModule();
    this.pausedOnchain.add(agent.id);
    log('warn', 'kill switch: module paused on-chain', { agent: agent.id, txHash: hash });
    this.d.state.record({ at: new Date(this.now()).toISOString(), agentId: agent.id, status: 'sent', reason: 'KILL SWITCH -> module.pause()', txHash: hash });
  }

  private schedule(agent: LoadedAgent, delayMs: number) {
    const s = this.d.state.agent(agent.id);
    s.nextRunAt = new Date(this.now() + delayMs).toISOString();
    this.d.state.save();
  }

  private finish(agent: LoadedAgent, rec: Omit<TradeRecord, 'at' | 'agentId'>, nextDelayMs: number) {
    const full: TradeRecord = { at: new Date(this.now()).toISOString(), agentId: agent.id, ...rec };
    const s = this.d.state.agent(agent.id);
    s.lastRunAt = full.at;
    s.totals.runs += 1;
    this.d.state.record(full);
    this.schedule(agent, nextDelayMs);
    this.d.log(rec.status === 'error' ? 'error' : 'info', `agent ${agent.id}: ${rec.status}`, { ...full });
    return full;
  }

  private todaysConfirmedUsd(agentId: string): number {
    const day = new Date(this.now()).toISOString().slice(0, 10);
    return this.d.state
      .get()
      .trades.filter((t) => t.agentId === agentId && t.status === 'confirmed' && t.at.startsWith(day))
      .reduce((a, t) => a + (t.usd ?? 0), 0);
  }

  /** One scheduling step for one agent. Returns the record if something was attempted. */
  async runAgent(agent: LoadedAgent): Promise<TradeRecord | undefined> {
    const { reader, config } = this.d;
    const st = this.d.state.agent(agent.id);
    const intervalMs = agent.intervalMinutes * 60_000;
    const nowMs = this.now();
    if (st.nextRunAt && Date.parse(st.nextRunAt) > nowMs) return undefined;

    const pre = await this.preflight(agent);
    if (!pre.ok) return this.finish(agent, { status: 'skipped', reason: `preflight: ${pre.problems.join('; ')}` }, RETRY_MS);

    const ex = this.d.executors.get(agent.id)!;
    const m: ModuleState = await reader.moduleState(agent.module);
    const chainNow = await reader.now();

    // On-chain schedule is the source of truth (survives lost state / multiple Flux instances).
    const lastOnchainMs = Number(m.lastSwapAt) * 1000;
    if (m.lastSwapAt > 0n && lastOnchainMs + intervalMs > nowMs) {
      this.schedule(agent, lastOnchainMs + intervalMs - nowMs);
      return undefined;
    }
    if (m.paused) return this.finish(agent, { status: 'skipped', reason: 'module paused on-chain' }, RETRY_MS);
    if (m.lastSwapAt > 0n && chainNow < m.lastSwapAt + m.cooldownSeconds) {
      return this.finish(agent, { status: 'skipped', reason: 'on-chain cooldown active' }, RETRY_MS);
    }

    const decision = await decide(agent, this.d.indicators);
    if (!(decision.amountUsd > 0)) {
      return this.finish(agent, { status: 'skipped', reason: decision.reason }, intervalMs);
    }

    // ---- clamp to limits (off-chain agent cap, on-chain per-swap and daily caps)
    let want = usd18(decision.amountUsd);
    if (agent.maxDailyUsd !== undefined) {
      const left = agent.maxDailyUsd - this.todaysConfirmedUsd(agent.id);
      if (left <= 0) return this.finish(agent, { status: 'skipped', reason: 'agent maxDailyUsd reached' }, RETRY_MS * 4);
      if (usd18(left) < want) want = usd18(left);
    }
    const chainDay = chainNow / 86_400n;
    const spent = m.currentDay === chainDay ? m.spentTodayUsd : 0n;
    const dailyLeft = m.dailyLimitUsd > spent ? m.dailyLimitUsd - spent : 0n;
    const cap = ((m.perSwapLimitUsd < dailyLeft ? m.perSwapLimitUsd : dailyLeft) * LIMIT_HEADROOM_BPS) / 10_000n;
    if (cap <= 0n) return this.finish(agent, { status: 'skipped', reason: 'on-chain daily limit reached' }, RETRY_MS * 4);
    if (want > cap) want = cap;

    // ---- prices from the SAME oracles the module uses
    const [cin, cout]: TokenConfig[] = await Promise.all([
      reader.tokenConfig(agent.module, agent.tokenIn),
      reader.tokenConfig(agent.module, agent.tokenOut),
    ]);
    const [fin, fout] = await Promise.all([reader.feed(cin.usdFeed), reader.feed(cout.usdFeed)]);
    if (isStale(fin, chainNow, m.maxOracleAge) || isStale(fout, chainNow, m.maxOracleAge)) {
      return this.finish(agent, { status: 'skipped', reason: 'oracle price stale' }, RETRY_MS);
    }
    const pIn = price18(fin);
    const pOut = price18(fout);
    const amountIn = amountForUsd(want, cin.tokenDecimals, pIn);
    if (amountIn === 0n) return this.finish(agent, { status: 'skipped', reason: 'amount rounds to 0' }, intervalMs);

    const bal = await reader.balanceOf(agent.tokenIn, config.safe);
    if (bal < amountIn) {
      return this.finish(agent, { status: 'skipped', reason: `Safe balance too low (${bal} < ${amountIn})` }, RETRY_MS * 4);
    }
    const amountOutMinimum = minAmountOut(amountIn, cin, cout, pIn, pOut, agent.maxSlippageBps, m.maxSlippageBps);
    const args = {
      tokenIn: getAddress(agent.tokenIn) as Address,
      tokenOut: getAddress(agent.tokenOut) as Address,
      fee: agent.fee,
      amountIn,
      amountOutMinimum,
    };
    const base = {
      tokenIn: args.tokenIn,
      tokenOut: args.tokenOut,
      amountIn: amountIn.toString(),
      amountOutMinimum: amountOutMinimum.toString(),
      usd: fromUsd18(want),
    };

    let simulatedOut: bigint;
    try {
      simulatedOut = await ex.simulateSwap(args);
    } catch (e) {
      return this.finish(agent, { ...base, status: 'error', reason: `simulation reverted: ${safeError(e)}` }, RETRY_MS);
    }

    if (config.dryRun) {
      return this.finish(agent, { ...base, simulatedOut: simulatedOut.toString(), status: 'dry-run', reason: `DRY_RUN - ${decision.reason}` }, intervalMs);
    }
    if (this.killActive()) return this.finish(agent, { ...base, status: 'skipped', reason: 'kill switch' }, RETRY_MS);

    const hash = await ex.sendSwap(args);
    this.d.log('info', 'swap sent', { agent: agent.id, txHash: hash });
    let receipt: { status: string };
    try {
      receipt = await ex.waitForReceipt(hash);
    } catch (e) {
      // Never resend blindly: back off; the on-chain cooldown also blocks a duplicate.
      return this.finish(
        agent,
        { ...base, simulatedOut: simulatedOut.toString(), txHash: hash, status: 'sent', reason: `receipt pending: ${safeError(e)}` },
        RETRY_MS,
      );
    }
    return this.finish(
      agent,
      {
        ...base,
        simulatedOut: simulatedOut.toString(),
        txHash: hash,
        status: receipt.status === 'success' ? 'confirmed' : 'reverted',
        reason: decision.reason,
      },
      receipt.status === 'success' ? intervalMs : RETRY_MS,
    );
  }

  /** Public, read-only, secret-free status snapshot. */
  status() {
    const { config, state } = this.d;
    const s = state.get();
    return {
      service: 'buy-simple-dca agent-runner',
      startedAt: this.startedAt,
      network: config.network.key,
      chainId: config.network.chain.id,
      testnet: config.network.testnet,
      dryRun: config.dryRun,
      killSwitch: this.killActive(),
      safe: config.safe,
      agents: config.agents.map((a) => ({
        id: a.id,
        name: a.name ?? a.id,
        enabled: a.enabled,
        strategy: a.strategy,
        agentAddress: this.d.executors.get(a.id)?.agentAddress ?? null,
        module: a.module,
        tokenIn: a.tokenIn,
        tokenOut: a.tokenOut,
        fee: a.fee,
        amountUsd: a.amountUsd,
        intervalMinutes: a.intervalMinutes,
        preflight: this.preflights.get(a.id) ?? null,
        ...(s.agents[a.id] ?? { totals: { runs: 0, trades: 0, usdBought: 0 } }),
      })),
      trades: s.trades.slice(0, 50),
    };
  }
}

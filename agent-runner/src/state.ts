import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export interface TradeRecord {
  at: string;
  agentId: string;
  status: 'dry-run' | 'sent' | 'confirmed' | 'reverted' | 'skipped' | 'error';
  reason: string;
  tokenIn?: string;
  tokenOut?: string;
  amountIn?: string;
  amountOutMinimum?: string;
  simulatedOut?: string;
  usd?: number;
  txHash?: string;
}

export interface AgentState {
  lastRunAt?: string;
  nextRunAt?: string;
  lastResult?: TradeRecord;
  totals: { runs: number; trades: number; usdBought: number };
}

export interface RunnerState {
  version: 1;
  agents: Record<string, AgentState>;
  trades: TradeRecord[]; // newest first, capped
}

const MAX_TRADES = 200;

export class StateStore {
  private state: RunnerState;
  private readonly file: string;

  constructor(private readonly dir: string) {
    mkdirSync(dir, { recursive: true });
    this.file = join(dir, 'agent-runner-state.json');
    this.state = this.load();
  }

  private load(): RunnerState {
    try {
      if (existsSync(this.file)) {
        const s = JSON.parse(readFileSync(this.file, 'utf8')) as RunnerState;
        if (s && s.version === 1 && s.agents && Array.isArray(s.trades)) return s;
      }
    } catch {
      /* corrupt -> start fresh, keep file for inspection */
    }
    return { version: 1, agents: {}, trades: [] };
  }

  get(): RunnerState {
    return this.state;
  }

  agent(id: string): AgentState {
    return (this.state.agents[id] ??= { totals: { runs: 0, trades: 0, usdBought: 0 } });
  }

  record(rec: TradeRecord): void {
    this.state.trades.unshift(rec);
    this.state.trades.length = Math.min(this.state.trades.length, MAX_TRADES);
    const a = this.agent(rec.agentId);
    a.lastResult = rec;
    if (rec.status === 'confirmed') {
      a.totals.trades += 1;
      a.totals.usdBought += rec.usd ?? 0;
    }
    this.save();
  }

  save(): void {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.state, null, 2));
    renameSync(tmp, this.file); // atomic on POSIX
  }

  killFilePresent(): boolean {
    return existsSync(join(this.dir, 'KILL'));
  }
}

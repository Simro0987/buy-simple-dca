import { spawn, type ChildProcess } from 'node:child_process';

export interface PostgrestOptions {
  bin: string;
  port: number;
  pool: number;
  dbUri: string;
  jwtSecret: string;
  log: (m: string, d?: Record<string, unknown>) => void;
}

/** Runs PostgREST as a child process on 127.0.0.1 and restarts it if it exits. */
export class PostgrestProcess {
  private child: ChildProcess | null = null;
  private stopped = false;
  private restarts = 0;
  constructor(private o: PostgrestOptions) {}

  start() {
    this.stopped = false;
    const env = {
      PATH: process.env.PATH ?? '/usr/bin:/bin',
      PGRST_DB_URI: this.o.dbUri,
      PGRST_DB_SCHEMAS: 'public',
      PGRST_DB_ANON_ROLE: 'anon',
      PGRST_JWT_SECRET: this.o.jwtSecret,
      PGRST_SERVER_HOST: '127.0.0.1',
      PGRST_SERVER_PORT: String(this.o.port),
      PGRST_DB_POOL: String(this.o.pool),
      PGRST_DB_MAX_ROWS: '5000',
      PGRST_LOG_LEVEL: 'warn',
      PGRST_OPENAPI_MODE: 'disabled',
    };
    const child = spawn(this.o.bin, [], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    this.child = child;
    const forward = (b: Buffer) => {
      const line = b.toString('utf8').trim();
      if (line) this.o.log('postgrest', { line: line.replace(/postgres(ql)?:\/\/[^\s]+/g, '<db-uri>') });
    };
    child.stdout?.on('data', forward);
    child.stderr?.on('data', forward);
    child.on('exit', (code) => {
      this.child = null;
      if (this.stopped) return;
      this.restarts += 1;
      const delay = Math.min(30_000, 1000 * 2 ** Math.min(this.restarts, 5));
      this.o.log('postgrest exited, restarting', { code, delayMs: delay });
      setTimeout(() => this.start(), delay).unref();
    });
  }

  async waitReady(timeoutMs = 30_000): Promise<boolean> {
    const until = Date.now() + timeoutMs;
    while (Date.now() < until) {
      if (await this.ping()) return true;
      await new Promise((r) => setTimeout(r, 300));
    }
    return false;
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(`http://127.0.0.1:${this.o.port}/`, { method: 'HEAD', signal: AbortSignal.timeout(2000) });
      return r.status < 500;
    } catch {
      return false;
    }
  }

  stop() {
    this.stopped = true;
    this.child?.kill('SIGTERM');
  }
}

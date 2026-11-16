import type { Pool } from 'pg';
import { cronMatches, parseCron, type CronSpec } from './cron';

/** The two former pg_cron jobs, now run in-process (UTC like pg_cron). */
export const JOBS = [
  { jobname: 'poll-telegram-callbacks', schedule: '* * * * *', fn: 'telegram-poll-callbacks' },
  { jobname: 'daily-risk-report-19cet', schedule: '0 18 * * *', fn: 'telegram-daily-risk-report' },
] as const;

export interface SchedulerDeps {
  pool: Pool;
  invoke: (fn: string) => Promise<{ status: number; text: string }>;
  log: (m: string, d?: Record<string, unknown>) => void;
  now?: () => Date;
  /** Jobs that cannot work yet (e.g. no Telegram bot token) are stored as inactive. */
  enabled?: (jobname: string) => boolean;
}

export class Scheduler {
  private specs: { jobname: string; schedule: string; fn: string; spec: CronSpec; jobid?: number }[];
  private timer: NodeJS.Timeout | null = null;
  private lastMinute = -1;
  private running = new Set<string>();

  constructor(private d: SchedulerDeps) {
    this.specs = JOBS.map((j) => ({ ...j, spec: parseCron(j.schedule) }));
  }

  async init() {
    for (const j of this.specs) {
      const { rows } = await this.d.pool.query<{ jobid: string }>(
        `INSERT INTO cron.job (jobname, schedule, command, active) VALUES ($1, $2, $3, $4)
         ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command, active = EXCLUDED.active
         RETURNING jobid`,
        [j.jobname, j.schedule, `invoke function ${j.fn}`, this.d.enabled ? this.d.enabled(j.jobname) : true],
      );
      j.jobid = Number(rows[0].jobid);
    }
  }

  start() {
    this.timer = setInterval(() => void this.tick(), 5_000);
    this.timer.unref();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Runs due jobs once per matching minute; a job never overlaps itself. */
  async tick(): Promise<string[]> {
    const now = this.d.now ? this.d.now() : new Date();
    const minuteKey = Math.floor(now.getTime() / 60_000);
    if (minuteKey === this.lastMinute) return [];
    this.lastMinute = minuteKey;
    const started: string[] = [];
    for (const j of this.specs) {
      if (!cronMatches(j.spec, now) || this.running.has(j.jobname)) continue;
      const { rows } = await this.d.pool.query<{ active: boolean }>(`SELECT active FROM cron.job WHERE jobid = $1`, [j.jobid]);
      if (rows[0] && rows[0].active === false) continue;
      started.push(j.jobname);
      void this.run(j);
    }
    return started;
  }

  private async run(j: { jobname: string; fn: string; jobid?: number }) {
    this.running.add(j.jobname);
    const { rows } = await this.d.pool.query<{ runid: string }>(
      `INSERT INTO cron.job_run_details (jobid, status) VALUES ($1, 'running') RETURNING runid`,
      [j.jobid],
    );
    const runid = rows[0].runid;
    let status = 'succeeded';
    let message = '';
    try {
      const r = await this.d.invoke(j.fn);
      message = `HTTP ${r.status} ${r.text.slice(0, 300)}`;
      if (r.status >= 400) status = 'failed';
    } catch (e) {
      status = 'failed';
      message = (e as Error).message;
    } finally {
      this.running.delete(j.jobname);
    }
    await this.d.pool.query(`UPDATE cron.job_run_details SET status = $2, return_message = $3, end_time = now() WHERE runid = $1`, [runid, status, message]);
    await this.d.pool.query(`DELETE FROM cron.job_run_details WHERE start_time < now() - interval '7 days'`);
    if (status !== 'succeeded') this.d.log(`cron job ${j.jobname} ${status}`, { message });
  }
}

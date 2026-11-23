import { describe, expect, it } from 'vitest';
import { parseEnvFile } from '../src/config';
import { cronMatches, parseCron } from '../src/cron';
import { signJwt, verifyJwt } from '../src/jwt';
import { createOutboundFetch } from '../src/outbound';
import { RateLimiter } from '../src/rateLimit';
import { JOBS } from '../src/scheduler';

const SECRET = 'x'.repeat(40);

describe('jwt', () => {
  it('signs and verifies HS256; rejects tamper, wrong secret, expiry', () => {
    const t = signJwt({ sub: 'u1', role: 'authenticated', exp: 2000 }, SECRET);
    expect(verifyJwt(t, SECRET, 1000)?.sub).toBe('u1');
    expect(verifyJwt(t, SECRET, 2000)).toBeNull();
    expect(verifyJwt(t, 'y'.repeat(40), 1000)).toBeNull();
    const [h, , s] = t.split('.');
    const forged = Buffer.from(JSON.stringify({ sub: 'u1', role: 'service_role', exp: 2000 })).toString('base64url');
    expect(verifyJwt(`${h}.${forged}.${s}`, SECRET, 1000)).toBeNull();
    expect(verifyJwt('not.a.jwt', SECRET)).toBeNull();
  });
  it('rejects alg=none', () => {
    const h = Buffer.from(JSON.stringify({ alg: 'none' })).toString('base64url');
    const p = Buffer.from(JSON.stringify({ sub: 'x' })).toString('base64url');
    expect(verifyJwt(`${h}.${p}.`, SECRET)).toBeNull();
  });
});

describe('cron', () => {
  it('matches the two ported pg_cron schedules (UTC)', () => {
    const every = parseCron(JOBS[0].schedule);
    const daily = parseCron(JOBS[1].schedule);
    expect(cronMatches(every, new Date('2026-11-16T03:07:00Z'))).toBe(true);
    expect(cronMatches(daily, new Date('2026-11-16T18:00:30Z'))).toBe(true);
    expect(cronMatches(daily, new Date('2026-11-16T19:00:00Z'))).toBe(false);
  });
  it('supports lists, ranges, steps, dow 7 = sunday', () => {
    const s = parseCron('*/15 9-17 * * 1-5');
    expect(cronMatches(s, new Date('2026-11-16T09:45:00Z'))).toBe(true); // Monday
    expect(cronMatches(s, new Date('2026-11-15T09:45:00Z'))).toBe(false); // Sunday
    expect(cronMatches(parseCron('0 0 * * 7'), new Date('2026-11-15T00:00:00Z'))).toBe(true);
    expect(() => parseCron('61 * * * *')).toThrow();
    expect(() => parseCron('* * *')).toThrow();
  });
});

describe('secrets file', () => {
  it('parses KEY=VALUE with comments and quotes', () => {
    expect(parseEnvFile('# c\nTELEGRAM_BOT_TOKEN="123:abc"\nexport AI_API_KEY=sk-1\nbad line\nlower=x\n')).toEqual({
      TELEGRAM_BOT_TOKEN: '123:abc',
      AI_API_KEY: 'sk-1',
    });
  });
});

describe('outbound shim (internal gateways -> real providers)', () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const base = (async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response('{"ok":true}');
  }) as typeof fetch;

  it('routes Telegram gateway to api.telegram.org with the bot token and strips gateway auth', async () => {
    calls.length = 0;
    const f = createOutboundFetch(base, { TELEGRAM_BOT_TOKEN: '42:SECRET' });
    await f('http://telegram-gateway.internal/sendMessage', {
      method: 'POST',
      headers: { Authorization: 'Bearer internal', 'X-Connection-Api-Key': 'k', 'Content-Type': 'application/json' },
      body: '{}',
    });
    expect(calls[0].url).toBe('https://api.telegram.org/bot42:SECRET/sendMessage');
    const h = new Headers(calls[0].init?.headers);
    expect(h.get('authorization')).toBeNull();
    expect(h.get('x-connection-api-key')).toBeNull();
  });
  it('routes AI gateway to the configured OpenAI-compatible endpoint, optional model override', async () => {
    calls.length = 0;
    const f = createOutboundFetch(base, { AI_API_KEY: 'sk-x', AI_BASE_URL: 'https://openrouter.ai/api/v1/', AI_MODEL: 'openai/gpt-4o-mini' });
    await f('http://ai-gateway.internal/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: 'Bearer internal' },
      body: JSON.stringify({ model: 'google/gemini-2.5-flash', messages: [] }),
    });
    expect(calls[0].url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(new Headers(calls[0].init?.headers).get('authorization')).toBe('Bearer sk-x');
    expect(JSON.parse(String(calls[0].init?.body)).model).toBe('openai/gpt-4o-mini');
  });
  it('returns 503 when keys are missing and passes other URLs through', async () => {
    calls.length = 0;
    const f = createOutboundFetch(base, {});
    expect((await f('http://telegram-gateway.internal/sendMessage')).status).toBe(503);
    expect((await f('http://ai-gateway.internal/v1/chat/completions')).status).toBe(503);
    await f('https://api.coingecko.com/api/v3/ping');
    expect(calls.map((c) => c.url)).toEqual(['https://api.coingecko.com/api/v3/ping']);
  });
});

describe('rate limiter', () => {
  it('limits per key per window', () => {
    const r = new RateLimiter(2, 1000);
    expect([r.allow('a', 0), r.allow('a', 1), r.allow('a', 2), r.allow('b', 2), r.allow('a', 1001)]).toEqual([true, true, false, true, true]);
  });
});

describe('scheduler', () => {
  it('runs due jobs once per minute, records runs, skips inactive jobs', async () => {
    const { Scheduler } = await import('../src/scheduler');
    const queries: string[] = [];
    let active = true;
    const pool = {
      query: async (sql: string) => {
        queries.push(sql.replace(/\s+/g, ' ').trim());
        if (sql.includes('INSERT INTO cron.job ')) return { rows: [{ jobid: '1' }] };
        if (sql.includes('SELECT active')) return { rows: [{ active }] };
        if (sql.includes('job_run_details') && sql.includes('RETURNING')) return { rows: [{ runid: '9' }] };
        return { rows: [] };
      },
    };
    const invoked: string[] = [];
    let now = new Date('2026-11-16T18:00:01Z');
    const s = new Scheduler({ pool: pool as never, log: () => {}, now: () => now, invoke: async (fn) => (invoked.push(fn), { status: 200, text: 'ok' }) });
    await s.init();
    expect(await s.tick()).toEqual(['poll-telegram-callbacks', 'daily-risk-report-19cet']);
    expect(await s.tick()).toEqual([]); // same minute
    await new Promise((r) => setTimeout(r, 10));
    expect(invoked.sort()).toEqual(['telegram-daily-risk-report', 'telegram-poll-callbacks']);
    active = false;
    now = new Date('2026-11-16T18:01:01Z');
    expect(await s.tick()).toEqual([]);
  });
});

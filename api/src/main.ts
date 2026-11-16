import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { SiweAuth } from './auth';
import { ConfigError, loadConfig, type ApiConfig } from './config';
import { createErc1271Checker } from './erc1271';
import { functionNames, getFunction, installDenoShim, invokeFunction, PUBLIC_FUNCTIONS, registerFunction } from './functions';
import { FUNCTION_LOADERS } from './functions.generated';
import { signJwt } from './jwt';
import { runImports, runMigrations, setAuthenticatorPassword } from './migrate';
import { createOutboundFetch } from './outbound';
import { PostgrestProcess } from './postgrest';
import { Scheduler } from './scheduler';
import { createGateway } from './server';

const log = (msg: string, data?: Record<string, unknown>) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), msg, ...(data ?? {}) }));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const here = dirname(fileURLToPath(import.meta.url));

async function loadConfigWithRetry(): Promise<ApiConfig> {
  for (let i = 0; ; i++) {
    try {
      return loadConfig();
    } catch (e) {
      if (!(e instanceof ConfigError) || i > 200) throw e;
      if (i % 10 === 0) log('waiting for configuration', { reason: (e as Error).message });
      await sleep(3000);
    }
  }
}

async function main() {
  const cfg = await loadConfigWithRetry();
  const pool = new pg.Pool({ ...cfg.db, max: 5, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  pool.on('error', (e) => log('db pool error', { error: e.message }));
  for (let i = 0; ; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (e) {
      if (i % 10 === 0) log('waiting for database', { host: cfg.db.host, error: (e as Error).message });
      await sleep(2000);
    }
  }
  await runMigrations(pool, process.env.MIGRATIONS_DIR || join(here, 'migrations'), (m) => log(m));
  await runImports(pool, cfg.importDir, (m) => log(m));

  const authenticatorPassword = randomBytes(24).toString('hex');
  await setAuthenticatorPassword(pool, authenticatorPassword);
  const pgrst = new PostgrestProcess({
    bin: cfg.postgrest.bin,
    port: cfg.postgrest.port,
    pool: cfg.postgrest.pool,
    dbUri: `postgres://authenticator:${authenticatorPassword}@${cfg.db.host}:${cfg.db.port}/${cfg.db.database}`,
    jwtSecret: cfg.jwtSecret,
    log,
  });
  pgrst.start();

  // Server-side keys used by the ported functions (never sent to browsers).
  const now = Math.floor(Date.now() / 1000);
  const anonKey = signJwt({ iss: 'buy-simple-dca-api', role: 'anon', iat: now }, cfg.jwtSecret);
  const serviceKey = signJwt({ iss: 'buy-simple-dca-api', role: 'service_role', iat: now }, cfg.jwtSecret);
  globalThis.fetch = createOutboundFetch(globalThis.fetch, cfg.secrets);
  const shim = 'routed-by-api-outbound-shim';
  installDenoShim(
    Object.fromEntries(
      Object.entries({
        SUPABASE_URL: `http://127.0.0.1:${cfg.port}`,
        SUPABASE_ANON_KEY: anonKey,
        SUPABASE_SERVICE_ROLE_KEY: serviceKey,
        EDGE_FUNCTION_SECRET: cfg.edgeSecret,
        LOVABLE_API_KEY: shim,
        TELEGRAM_API_KEY: cfg.secrets.TELEGRAM_BOT_TOKEN ? shim : undefined,
        CRYPTOPANIC_API_KEY: cfg.secrets.CRYPTOPANIC_API_KEY,
        ETHERSCAN_API_KEY: cfg.secrets.ETHERSCAN_API_KEY,
        MOBULA_API_KEY: cfg.secrets.MOBULA_API_KEY,
      }).filter((e): e is [string, string] => typeof e[1] === 'string' && e[1].length > 0),
    ),
  );
  for (const [name, load] of Object.entries(FUNCTION_LOADERS)) {
    try {
      await registerFunction(name, load);
    } catch (e) {
      log('function failed to load', { name, error: (e as Error).message });
    }
  }
  log('functions loaded', { count: functionNames().length });

  const auth = new SiweAuth({
    db: pool,
    jwtSecret: cfg.jwtSecret,
    accessTtlSec: cfg.accessTtlSec,
    refreshTtlSec: cfg.refreshTtlSec,
    siweDomains: cfg.siweDomains,
    erc1271: createErc1271Checker(cfg.rpcUrls),
  });
  const server = createGateway({
    auth,
    jwtSecret: cfg.jwtSecret,
    edgeSecret: cfg.edgeSecret,
    postgrest: { host: '127.0.0.1', port: cfg.postgrest.port },
    allowedOrigins: cfg.allowedOrigins,
    isPublicFunction: (n) => PUBLIC_FUNCTIONS.has(n),
    invoke: (n, req) => invokeFunction(n, req),
    health: async () => {
      const db = await pool.query('SELECT 1').then(() => true, () => false);
      const rest = await pgrst.ping();
      return { ok: db && rest, db, postgrest: rest, functions: functionNames().length };
    },
    log,
  });
  server.listen(cfg.port, cfg.host, () => log('api listening', { port: cfg.port }));
  if (!(await pgrst.waitReady())) log('postgrest not ready yet (will keep retrying)');

  let scheduler: Scheduler | null = null;
  if (cfg.scheduler) {
    const hasTelegram = Boolean(cfg.secrets.TELEGRAM_BOT_TOKEN);
    if (!hasTelegram) log('TELEGRAM_BOT_TOKEN not set - telegram cron jobs are inactive');
    scheduler = new Scheduler({
      pool,
      log,
      enabled: () => hasTelegram, // both ported jobs are Telegram jobs
      invoke: async (fn) => {
        if (!getFunction(fn)) return { status: 404, text: 'function not loaded' };
        const r = await invokeFunction(
          fn,
          new Request(`http://functions.internal/functions/v1/${fn}`, {
            method: 'POST',
            headers: { 'content-type': 'application/json', 'x-edge-secret': cfg.edgeSecret, authorization: `Bearer ${anonKey}` },
            body: '{}',
          }),
          120_000,
        );
        return { status: r.status, text: await r.text() };
      },
    });
    await scheduler.init();
    scheduler.start();
  }

  const stop = (sig: string) => {
    log('shutting down', { sig });
    scheduler?.stop();
    pgrst.stop();
    server.close(() => void pool.end().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 8000).unref();
  };
  process.on('SIGTERM', () => stop('SIGTERM'));
  process.on('SIGINT', () => stop('SIGINT'));
}

main().catch((e) => {
  log('fatal', { error: (e as Error).message });
  process.exit(1);
});

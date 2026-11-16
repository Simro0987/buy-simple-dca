import { readdirSync, readFileSync, renameSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';

/** Applies api/migrations/NNNN_*.sql once each, in order, inside a transaction per file. */
export async function runMigrations(pool: Pool, dir: string, log: (m: string) => void = () => {}): Promise<string[]> {
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query(`SELECT pg_advisory_lock(727401)`);
    await client.query(`CREATE SCHEMA IF NOT EXISTS app_meta`);
    await client.query(`CREATE TABLE IF NOT EXISTS app_meta.schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
    const done = new Set((await client.query<{ version: string }>(`SELECT version FROM app_meta.schema_migrations`)).rows.map((r) => r.version));
    const files = readdirSync(dir).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
    for (const f of files) {
      if (done.has(f)) continue;
      const sql = readFileSync(join(dir, f), 'utf8');
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(`INSERT INTO app_meta.schema_migrations (version) VALUES ($1)`, [f]);
        await client.query('COMMIT');
        applied.push(f);
        log(`migration applied: ${f}`);
      } catch (e) {
        await client.query('ROLLBACK');
        throw new Error(`migration ${f} failed: ${(e as Error).message}`);
      }
    }
  } finally {
    await client.query(`SELECT pg_advisory_unlock(727401)`).catch(() => {});
    client.release();
  }
  return applied;
}

/** (Re)sets the PostgREST login role password; called on every start with a fresh random value. */
export async function setAuthenticatorPassword(pool: Pool, password: string): Promise<void> {
  const { rows } = await pool.query<{ sql: string }>(`SELECT format('ALTER ROLE authenticator WITH LOGIN PASSWORD %L', $1::text) AS sql`, [password]);
  await pool.query(rows[0].sql);
}

/**
 * One-time data import: any *.sql file dropped into IMPORT_DIR (e.g. the Supabase export made by
 * api/scripts/export-from-supabase.sh) is executed once with triggers/FK checks deferred
 * (session_replication_role = replica) and renamed to *.sql.done (or *.sql.failed).
 */
export async function runImports(pool: Pool, dir: string, log: (m: string) => void = () => {}): Promise<string[]> {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const done: string[] = [];
  for (const f of files) {
    const p = join(dir, f);
    const client: PoolClient = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(`SET LOCAL session_replication_role = replica`);
      await client.query(readFileSync(p, 'utf8'));
      await client.query('COMMIT');
      renameSync(p, `${p}.done`);
      done.push(f);
      log(`import applied: ${f}`);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      renameSync(p, `${p}.failed`);
      log(`import FAILED: ${f}: ${(e as Error).message}`);
    } finally {
      client.release();
    }
  }
  return done;
}

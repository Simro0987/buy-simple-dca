# api – own backend replacing Supabase

A Supabase-compatible gateway so the existing `supabase-js` code (frontend and the 32 edge
functions) keeps working unchanged against our own Postgres:

| Path | What |
|---|---|
| `/auth/v1/siwe/nonce`, `/auth/v1/siwe/verify` | Sign-In with Ethereum (EIP-4361). EOA signatures are verified locally, smart accounts (Safe) via EIP-1271 `isValidSignature` on the message chain (`RPC_URL_<chainId>` overrides the public RPC). Returns a GoTrue-shaped session. |
| `/auth/v1/token?grant_type=refresh_token`, `/auth/v1/user`, `/auth/v1/logout` | session refresh (rotation + reuse detection), current user, logout |
| `/rest/v1/*` | proxied to a bundled PostgREST on 127.0.0.1; RLS policies from the original migrations use `auth.uid()` from the JWT |
| `/functions/v1/<name>` | the original Deno functions in `supabase/functions`, loaded through a small Deno shim (`src/functions.ts`) |
| `/healthz` | health |

The optional `/sb` prefix is stripped (nginx in `web` proxies `/sb/` here).

* Migrations: `api/migrations/*.sql` (applied once, advisory-locked, tracked in `app_meta.schema_migrations`).
  `0002_public_schema.sql` is the schema produced by the original Supabase migrations.
* Scheduler: the two former `pg_cron` jobs (`src/scheduler.ts`), recorded in `cron.job*` for the status card.
  Inactive while `TELEGRAM_BOT_TOKEN` is not set.
* Outbound: calls to the Lovable gateways are rewritten (`src/outbound.ts`): Telegram → `api.telegram.org`
  with `TELEGRAM_BOT_TOKEN`; AI → `AI_BASE_URL` (OpenAI-compatible) with `AI_API_KEY` (+ optional `AI_MODEL`).
* Secrets: `API_SECRETS_FILE` (default `/appdata/secrets.env`, see `secrets.env.example`), `<KEY>_FILE`, or env.
  JWT and edge secrets are generated once into `/appdata/secrets/`. The DB password is read from
  `/run/secrets/db/postgres_password` (written by the `db` component).
* One-time import: `*.sql` in `/appdata/import/` are applied in one transaction and renamed `.done` / `.failed`
  (`scripts/export-from-supabase.sh` creates such a file from the old Supabase project).

## Develop / test
```bash
npm run typecheck:api
npm run test:api                       # unit tests; integration tests are skipped without API_TEST_URL
npm run build:api                      # -> api/dist/api.mjs
# integration: Postgres + PostgREST binary (see .github/workflows/docker-publish.yml, job "api")
DB_HOST=127.0.0.1 DB_PASSWORD=... POSTGREST_BIN=/path/postgrest SIWE_DOMAINS=localhost:8070 node api/dist/api.mjs &
API_TEST_URL=http://localhost:8070 npm run test:api
```

| Env | Default | |
|---|---|---|
| `API_PORT` | 8070 | |
| `DB_HOST` / `DB_PORT` / `DB_USER` / `DB_NAME` | db / 5432 / postgres / postgres | |
| `DB_PASSWORD` / `DB_PASSWORD_FILE` | `/run/secrets/db/postgres_password` | |
| `SIWE_DOMAINS` | request host | allowed SIWE `domain` values (comma separated) |
| `API_ALLOWED_ORIGINS` | – | extra CORS origins (e.g. a Vercel deployment) |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | 3600 / 2592000 | seconds |
| `SCHEDULER_ENABLED` | true | |
| `POSTGREST_BIN` / `POSTGREST_PORT` / `POSTGREST_POOL` | /usr/local/bin/postgrest / 3000 / 5 | |
| `DATA_DIR` / `IMPORT_DIR` | /appdata / /appdata/import | |

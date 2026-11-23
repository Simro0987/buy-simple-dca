# api – own backend (auth, data, server functions)

A small gateway in front of our own Postgres. The browser and the server functions use the tiny
client in `shared/apiClient.ts` (PostgREST query builder + SIWE session + functions.invoke):

| Path | What |
|---|---|
| `/auth/v1/siwe/nonce`, `/auth/v1/siwe/verify` | Sign-In with Ethereum (EIP-4361). EOA signatures are verified locally, smart accounts (Safe) via EIP-1271 `isValidSignature` on the message chain (`RPC_URL_<chainId>` overrides the public RPC). Returns a GoTrue-shaped session. |
| `/auth/v1/token?grant_type=refresh_token`, `/auth/v1/user`, `/auth/v1/logout` | session refresh (rotation + reuse detection), current user, logout |
| `/rest/v1/*` | proxied to a bundled PostgREST on 127.0.0.1; RLS policies from the original migrations use `auth.uid()` from the JWT |
| `/functions/v1/<name>` | server functions in `api/functions/<name>/index.ts` (Deno-style `Deno.serve`), loaded through a small shim (`src/functions.ts`). `data-proxy` proxies Solana RPC / Pyth / Binance funding / Coinglass so keys stay server-side; `ai-chat` uses the server-side AI key |
| `/healthz` | health |

The `/api` prefix (and the legacy `/sb`) is stripped; nginx in `web` proxies `/api/` here. Login is wallet-only (SIWE); email/password signup and login return 400.

* Migrations: `api/migrations/*.sql` (applied once, advisory-locked, tracked in `app_meta.schema_migrations`).
  `0002_public_schema.sql` is the consolidated app schema (old per-change migrations are archived in `docs/archive/`). After a new migration run `DATABASE_URL=... npm run gen:types` to refresh `src/lib/api/types.ts`.
* Scheduler: the two former `pg_cron` jobs (`src/scheduler.ts`), recorded in `cron.job*` for the status card.
  Inactive while `TELEGRAM_BOT_TOKEN` is not set.
* Outbound: the internal gateway hosts are rewritten (`src/outbound.ts`): `telegram-gateway.internal` → `api.telegram.org`
  with `TELEGRAM_BOT_TOKEN`; `ai-gateway.internal` → `AI_BASE_URL` (OpenAI-compatible) with `AI_API_KEY` (+ optional `AI_MODEL`).
* Secrets: `API_SECRETS_FILE` (default `/appdata/secrets.env`, see `secrets.env.example`), `<KEY>_FILE`, or env.
  JWT and edge secrets are generated once into `/appdata/secrets/`. The DB password is read from
  `/run/secrets/db/postgres_password` (written by the `db` component).
* One-time import: `*.sql` in `/appdata/import/` are applied in one transaction and renamed `.done` / `.failed`
  (`scripts/export-from-supabase.sh` can still create such a file from the old hosted project, one time).

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
| `API_ALLOWED_ORIGINS` | – | extra CORS origins (only if the web runs on another origin) |
| `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL` | 3600 / 2592000 | seconds |
| `SCHEDULER_ENABLED` | true | |
| `POSTGREST_BIN` / `POSTGREST_PORT` / `POSTGREST_POOL` | /usr/local/bin/postgrest / 3000 / 5 | |
| `DATA_DIR` / `IMPORT_DIR` | /appdata / /appdata/import | |

#!/bin/bash
# Restore an encrypted backup into an EMPTY Postgres (fresh db volume).
#   restore.sh <backup.sql.gz.age | s3://key> <age-identity-file> [--replace]
# --replace first DROPS the app schemas (public, auth, cron, app_meta) of a non-empty database -
# use it on Flux when the api already created empty tables; then restart the api component.
# Connection via standard PG* env (default: local socket as postgres).
# The age identity (private key) is only needed here - never store it on the server.
set -euo pipefail
SRC="${1:?backup file or s3://<key>}"
ID="${2:?age identity file (private key)}"
export PGHOST="${PGHOST:-/var/run/postgresql}" PGUSER="${PGUSER:-postgres}" PGDATABASE="${PGDATABASE:-postgres}"
if [[ "$SRC" == s3://* ]]; then
  tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
  s3.sh get "${SRC#s3://}" "$tmp"
  SRC="$tmp"
fi
if [ "$(psql -qAtc "select count(*) from information_schema.tables where table_schema='public'")" != "0" ]; then
  if [ "${3:-}" != "--replace" ]; then
    echo "restore: target database already has tables in schema public - use an empty database or --replace" >&2
    exit 2
  fi
  echo "restore: --replace: dropping schemas public, auth, cron, app_meta"
  PGOPTIONS='-c client_min_messages=warning' psql -q -v ON_ERROR_STOP=1 -c 'DROP SCHEMA IF EXISTS public, auth, cron, app_meta CASCADE' -c 'CREATE SCHEMA public'
fi
age -d -i "$ID" "$SRC" | gunzip | psql -q -v ON_ERROR_STOP=1 --single-transaction >/dev/null
echo "restore: ok - tables: $(psql -qAtc "select count(*) from information_schema.tables where table_schema='public'")"

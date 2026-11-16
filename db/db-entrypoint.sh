#!/bin/bash
# Prepares the shared DB password (Flux cross-component mount), applies small-box tuning,
# starts the backup loop and hands over to the official postgres entrypoint.
set -euo pipefail

if [ "${1:-}" = "postgres" ]; then
  shift
  SECRETS_DIR="${DB_SECRETS_DIR:-/run/secrets/db}"
  PWFILE="$SECRETS_DIR/postgres_password"
  mkdir -p "$SECRETS_DIR"
  chmod 0750 "$SECRETS_DIR"
  if [ ! -s "$PWFILE" ]; then
    # 32 random bytes, hex. Generated once and kept on the volume; never printed.
    ( umask 077; head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n' > "$PWFILE" )
    echo "db: generated a new database password in $PWFILE"
  fi
  # Readable by root + group ${DB_SECRET_GID} (the api container's "node" user, gid 1000).
  chown "0:${DB_SECRET_GID:-1000}" "$SECRETS_DIR" "$PWFILE"
  chmod 0640 "$PWFILE"
  POSTGRES_PASSWORD="$(cat "$PWFILE")"
  export POSTGRES_PASSWORD
  unset POSTGRES_PASSWORD_FILE


  # Volume root (holds pgdata, backup.env, backup status, BACKUP_NOW trigger) belongs to postgres.
  ROOT="${BACKUP_ROOT:-/var/lib/postgresql/data}"
  mkdir -p "$ROOT"
  chown postgres:postgres "$ROOT"
  chmod 0700 "$ROOT"
  if [ -f "${BACKUP_ENV_FILE:-}" ]; then chown postgres:postgres "$BACKUP_ENV_FILE"; chmod 0600 "$BACKUP_ENV_FILE"; fi

  # Tuned for a ~500 MB container on a shared Flux node (override any via env).
  set -- postgres \
    -c listen_addresses='*' \
    -c max_connections="${PG_MAX_CONNECTIONS:-30}" \
    -c shared_buffers="${PG_SHARED_BUFFERS:-96MB}" \
    -c effective_cache_size="${PG_EFFECTIVE_CACHE_SIZE:-256MB}" \
    -c work_mem="${PG_WORK_MEM:-2MB}" \
    -c maintenance_work_mem="${PG_MAINTENANCE_WORK_MEM:-32MB}" \
    -c wal_buffers=4MB \
    -c min_wal_size=64MB \
    -c max_wal_size="${PG_MAX_WAL_SIZE:-256MB}" \
    -c checkpoint_completion_target=0.9 \
    -c random_page_cost=1.1 \
    -c effective_io_concurrency=100 \
    -c max_worker_processes=4 \
    -c max_parallel_workers=0 \
    -c max_parallel_workers_per_gather=0 \
    -c huge_pages=off \
    -c password_encryption=scram-sha-256 \
    -c idle_in_transaction_session_timeout=60s \
    -c statement_timeout="${PG_STATEMENT_TIMEOUT:-60s}" \
    -c log_min_duration_statement=2000 \
    -c log_checkpoints=off \
    -c timezone=UTC \
    "$@"

  # Backup loop + password sync, detached from this shell (tini reaps it).
  ( setsid su-exec postgres /usr/local/bin/backup-loop.sh </dev/null >>/proc/1/fd/1 2>>/proc/1/fd/2 & ) || true
fi

exec docker-entrypoint.sh "$@"

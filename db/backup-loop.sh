#!/bin/bash
# Runs next to postgres in the db container:
#  1. keeps the postgres role password in sync with the shared password file,
#  2. runs backup.sh nightly at BACKUP_HOUR_UTC, on start (BACKUP_ON_START=true),
#     or when a file named BACKUP_NOW appears in the volume root.
set -uo pipefail
ROOT="${BACKUP_ROOT:-/var/lib/postgresql/data}"
PWFILE="${DB_SECRETS_DIR:-/run/secrets/db}/postgres_password"
export PGHOST=/var/run/postgresql PGUSER=postgres
log() { echo "backup-loop: $*"; }

until pg_isready -q 2>/dev/null && psql -qAtc 'select 1' >/dev/null 2>&1; do sleep 3; done
# Shared password file is the source of truth (e.g. if the secrets dir was recreated).
if [ -s "$PWFILE" ]; then
  psql -q -v ON_ERROR_STOP=1 -v pw="$(cat "$PWFILE")" <<'SQL' >/dev/null 2>&1 && log "postgres password synced" || log "password sync failed"
ALTER ROLE postgres PASSWORD :'pw';
SQL
fi

run() {
  log "starting backup ($1)"
  backup.sh
  rc=$?
  if [ $rc -eq 0 ]; then rm -f "$ROOT/backup-status.failed.json"; return 0; fi
  [ $rc -eq 3 ] && return 0 # not configured
  log "backup FAILED (exit $rc)"
  printf '{"lastFailure":"%s","exit":%s}\n' "$(date -u +%FT%TZ)" "$rc" > "$ROOT/backup-status.failed.json" 2>/dev/null
  return $rc
}

[ "${BACKUP_ON_START:-false}" = "true" ] && run start
HOUR="$(printf '%02d' "${BACKUP_HOUR_UTC:-2}")"
while sleep 60; do
  if [ -e "$ROOT/BACKUP_NOW" ]; then rm -f "$ROOT/BACKUP_NOW"; run manual; fi
  today="$(date -u +%F)"
  if [ "$(date -u +%H)" = "$HOUR" ] && [ "$(cat "$ROOT/.last-backup-day" 2>/dev/null)" != "$today" ]; then
    date -u +%F > "$ROOT/.last-backup-day" # one attempt per night; a failure is logged + status file
    run nightly
  fi
done

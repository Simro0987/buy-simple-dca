#!/bin/bash
# One backup run: pg_dumpall globals + pg_dump (plain SQL) -> gzip -> age (PUBLIC key only)
# -> upload to S3/Storj, then retention. The plaintext never touches disk; the server
# cannot decrypt its own backups (only the holder of the age private key can).
set -euo pipefail
log() { echo "backup: $*"; }

load_env_file() {
  local f="${BACKUP_ENV_FILE:-}"
  [ -n "$f" ] && [ -f "$f" ] || return 0
  local line k v
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [[ "$line" =~ ^[[:space:]]*(#|$) ]] && continue
    line="${line#export }"
    [[ "$line" =~ ^([A-Z0-9_]+)=(.*)$ ]] || continue
    k="${BASH_REMATCH[1]}"; v="${BASH_REMATCH[2]}"
    v="${v#\"}"; v="${v%\"}"; v="${v#\'}"; v="${v%\'}"
    case "$k" in S3_* | BACKUP_*) export "$k=$v" ;; esac
  done < "$f"
}
load_env_file

missing=()
for v in S3_ENDPOINT S3_BUCKET S3_ACCESS_KEY_ID S3_SECRET_ACCESS_KEY BACKUP_AGE_RECIPIENTS; do
  [ -n "${!v:-}" ] && [[ "${!v}" != *REPLACE* ]] || missing+=("$v")
done
if [ ${#missing[@]} -gt 0 ]; then
  log "not configured (missing: ${missing[*]}) - skipping"
  exit 3
fi

recips=()
for r in ${BACKUP_AGE_RECIPIENTS//,/ }; do
  [[ "$r" =~ ^(age1[0-9a-z]{58}|ssh-(ed25519|rsa) .+)$ ]] || { log "invalid age recipient: ${r:0:12}..."; exit 4; }
  recips+=(-r "$r")
done

STATUS="${BACKUP_STATUS_FILE:-/var/lib/postgresql/data/backup-status.json}"
PREFIX="${S3_PREFIX:-buy-simple-dca/}"
TS="$(date -u +%Y%m%dT%H%M%SZ)"
KEY="${PREFIX}db-${TS}.sql.gz.age"
TMP="$(mktemp -d /tmp/backup.XXXXXX)"
trap 'rm -rf "$TMP"' EXIT
OUT="$TMP/db.sql.gz.age"

export PGHOST="${PGHOST:-/var/run/postgresql}" PGUSER="${PGUSER:-postgres}"
DB="${BACKUP_DB:-postgres}"

log "dumping database '$DB'"
{
  echo "-- buy-simple-dca backup $TS (restore: db/restore.sh)"
  echo "SET client_min_messages = warning;"
  # Roles (without passwords; the API re-randomizes the authenticator password on start).
  pg_dumpall --globals-only --no-role-passwords --no-tablespaces |
    grep -Ev '^(CREATE|ALTER) ROLE postgres( |;)' |
    sed -E 's/^CREATE ROLE ([a-z_]+);$/DO $do$ BEGIN CREATE ROLE \1; EXCEPTION WHEN duplicate_object THEN NULL; END $do$;/'
  pg_dump --format=plain --quote-all-identifiers "$DB"
} | gzip -6 | age "${recips[@]}" -o "$OUT"

# Sanity: age header present and non-trivial size.
head -c 21 "$OUT" | grep -q 'age-encryption.org/v1' || { log "encryption output invalid"; exit 5; }
SIZE="$(wc -c < "$OUT" | tr -d ' ')"
log "encrypted dump ${SIZE} bytes -> s3://$S3_BUCKET/$KEY"
s3.sh put "$OUT" "$KEY"

# Retention: delete our objects older than BACKUP_KEEP_DAYS, but always keep the newest BACKUP_KEEP_MIN.
KEEP_DAYS="${BACKUP_KEEP_DAYS:-30}"
KEEP_MIN="${BACKUP_KEEP_MIN:-7}"
CUTOFF="$(date -u -d "@$(( $(date -u +%s) - KEEP_DAYS * 86400 ))" +%Y%m%dT%H%M%SZ)"
mapfile -t keys < <(s3.sh list "${PREFIX}db-" | grep -E "^${PREFIX}db-[0-9]{8}T[0-9]{6}Z\.sql\.gz\.age$" | sort)
n=${#keys[@]}
deleted=0
for ((i = 0; i < n - KEEP_MIN; i++)); do
  k="${keys[$i]}"
  stamp="${k#${PREFIX}db-}"; stamp="${stamp%%.*}"
  if [[ "$stamp" < "$CUTOFF" ]]; then
    s3.sh delete "$k" && deleted=$((deleted + 1))
  fi
done
log "done ($n objects before retention, deleted $deleted)"
printf '{"lastSuccess":"%s","key":"%s","bytes":%s,"objects":%s}\n' "$TS" "$KEY" "$SIZE" "$((n - deleted))" > "$STATUS" 2>/dev/null || true

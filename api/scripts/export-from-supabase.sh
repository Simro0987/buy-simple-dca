#!/usr/bin/env bash
# One-time data export from the old Supabase project into ONE SQL file for the own API.
# Read-only on Supabase (pg_dump/psql SELECT only). Run it on YOUR computer - not on Flux.
#
#   SUPABASE_DB_URL='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres' \
#   WALLET_MAP='you@example.com=0xYourSafeOrWallet' \
#   ./api/scripts/export-from-supabase.sh > supabase-import.sql
#
# WALLET_MAP: comma-separated email=0xaddress pairs. Every Supabase user that owns data needs a
# wallet, because on the new API you log in with that wallet (Sign-In with Ethereum). User ids
# (uuid) are kept, so all rows stay attached to the same person.
# Then upload supabase-import.sql to the api volume as /appdata/import/supabase-import.sql and
# restart the api component (it is applied once in a transaction and renamed to *.done).
# Needs pg_dump/psql >= the Supabase server version (docker: postgres:17-alpine works).
set -euo pipefail
: "${SUPABASE_DB_URL:?set SUPABASE_DB_URL (Supabase -> Project Settings -> Database -> Connection string, session pooler)}"
WALLET_MAP="${WALLET_MAP:-}"

TABLES=(
  app_settings capital_entries dca_executions dca_purchases defi_positions engine_params
  learning_outcomes limit_orders staking_positions staking_rewards telegram_bot_state
  telegram_callback_log telegram_config telegram_sent_messages token_transactions
  tracked_tokens weekly_fill_snapshots weekly_scores
)

q() { psql "$SUPABASE_DB_URL" -X -qAt -v ON_ERROR_STOP=1 -c "$1"; }

# Verify the table list matches the source schema (fail loudly instead of silently skipping data).
src_tables="$(q "select string_agg(table_name, ' ' order by table_name) from information_schema.tables where table_schema='public' and table_type='BASE TABLE'")"
want="$(printf '%s\n' "${TABLES[@]}" | sort | tr '\n' ' ' | sed 's/ $//')"
if [ "$src_tables" != "$want" ]; then
  echo "export: public tables differ from the expected 18:" >&2
  echo "  source:   $src_tables" >&2
  echo "  expected: $want" >&2
  [ "${ALLOW_TABLE_MISMATCH:-0}" = "1" ] || exit 2
fi

declare -A MAP=()
IFS=',' read -ra pairs <<< "$WALLET_MAP"
for p in "${pairs[@]}"; do
  [ -z "$p" ] && continue
  email="$(printf '%s' "${p%%=*}" | tr '[:upper:]' '[:lower:]' | xargs)"
  addr="$(printf '%s' "${p#*=}" | tr '[:upper:]' '[:lower:]' | xargs)"
  [[ "$addr" =~ ^0x[0-9a-f]{40}$ ]] || { echo "export: invalid address for $email" >&2; exit 2; }
  MAP["$email"]="$addr"
done

# Users that own at least one row in any table.
owner_sql="select distinct user_id::text from ("
for t in "${TABLES[@]}"; do [ "$t" = telegram_bot_state ] && continue; owner_sql+="select user_id from public.\"$t\" where user_id is not null union all "; done
owner_sql="${owner_sql% union all }) x"
mapfile -t owners < <(q "$owner_sql" 2>/dev/null || true)

echo "-- buy-simple-dca: data export from Supabase ($(date -u +%FT%TZ))."
echo "-- Applied once by the api (IMPORT_DIR) inside one transaction with session_replication_role=replica."
echo "-- Replaces all app data in the target (fresh) database."
echo "TRUNCATE $(printf 'public.%s, ' "${TABLES[@]}" | sed 's/, $//') CASCADE;"

missing=0
while IFS='|' read -r id email created; do
  [ -z "$id" ] && continue
  e="$(printf '%s' "$email" | tr '[:upper:]' '[:lower:]')"
  addr="${MAP[$e]:-}"
  if [ -z "$addr" ]; then
    if printf '%s\n' "${owners[@]}" | grep -qx "$id"; then
      echo "export: user $email ($id) owns data but has no wallet in WALLET_MAP" >&2
      missing=1
    fi
    continue
  fi
  printf "INSERT INTO auth.users (id, wallet_address, email, created_at) VALUES ('%s', '%s', %s, '%s') ON CONFLICT (id) DO UPDATE SET wallet_address = EXCLUDED.wallet_address, email = EXCLUDED.email;\n" \
    "$id" "$addr" "$( [ -n "$email" ] && printf "'%s'" "${email//\'/\'\'}" || printf 'NULL')" "$created"
done < <(q "select id, coalesce(email,''), created_at from auth.users order by created_at")
[ "$missing" = "0" ] || { echo "export: add the missing users to WALLET_MAP (email=0xaddress)" >&2; exit 3; }

args=()
for t in "${TABLES[@]}"; do args+=(--table="public.\"$t\""); done
# --inserts: the api applies the file through a normal SQL connection (no COPY FROM stdin).
# Drop psql meta-commands (\restrict ...) and settings unknown to Postgres 16.
pg_dump "$SUPABASE_DB_URL" --data-only --no-owner --no-privileges --inserts --rows-per-insert=200 "${args[@]}" |
  grep -Ev '^(\\|SET transaction_timeout)'
echo "-- end of export"

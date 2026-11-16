#!/bin/bash
# Minimal S3 client (AWS SigV4 via curl) for Storj's S3 gateway / MinIO / any S3.
#   s3.sh put <local-file> <key> | s3.sh get <key> <local-file> | s3.sh list <prefix> | s3.sh delete <key>
# Needs S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY (S3_REGION optional).
# Credentials go to curl via a config on stdin, never on the command line.
set -euo pipefail
# Inside the db container the credentials live in backup.env (see backup.env.example).
if [ -z "${S3_ACCESS_KEY_ID:-}" ] && [ -r "${BACKUP_ENV_FILE:-/nonexistent}" ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"; line="${line#export }"
    [[ "$line" =~ ^(S3_[A-Z0-9_]+)=(.*)$ ]] || continue
    v="${BASH_REMATCH[2]}"; v="${v#\"}"; v="${v%\"}"; v="${v#\'}"; v="${v%\'}"
    export "${BASH_REMATCH[1]}=$v"
  done < "$BACKUP_ENV_FILE"
fi
: "${S3_ENDPOINT:?}" "${S3_BUCKET:?}" "${S3_ACCESS_KEY_ID:?}" "${S3_SECRET_ACCESS_KEY:?}"
REGION="${S3_REGION:-us-east-1}"
BASE="${S3_ENDPOINT%/}/${S3_BUCKET}"

_curl() {
  printf 'user = "%s:%s"\n' "$S3_ACCESS_KEY_ID" "$S3_SECRET_ACCESS_KEY" |
    curl -sS --fail-with-body --retry 3 --retry-delay 5 --connect-timeout 20 \
      --aws-sigv4 "aws:amz:${REGION}:s3" -K - "$@"
}
urlenc() { local s="$1" o="" c i; for ((i = 0; i < ${#s}; i++)); do c="${s:i:1}"; case "$c" in [a-zA-Z0-9._~/-]) o+="$c" ;; *) o+=$(printf '%%%02X' "'$c") ;; esac; done; printf '%s' "$o"; }

case "${1:-}" in
  put) _curl -o /dev/null -T "$2" -H "content-type: application/octet-stream" "$BASE/$(urlenc "$3")" ;;
  get) _curl -o "$3" "$BASE/$(urlenc "$2")" ;;
  delete) _curl -o /dev/null -X DELETE "$BASE/$(urlenc "$2")" ;;
  list)
    token=""
    while :; do
      q="list-type=2&max-keys=1000&prefix=$(urlenc "${2:-}")"
      [ -n "$token" ] && q="$q&continuation-token=$(urlenc "$token")"
      xml="$(_curl "$BASE?$q")"
      printf '%s' "$xml" | tr '<' '\n' | sed -n 's/^Key>//p'
      if printf '%s' "$xml" | grep -q '<IsTruncated>true</IsTruncated>'; then
        token="$(printf '%s' "$xml" | tr '<' '\n' | sed -n 's/^NextContinuationToken>//p')"
        [ -n "$token" ] || break
      else
        break
      fi
    done
    ;;
  *) echo "usage: s3.sh put|get|list|delete ..." >&2; exit 2 ;;
esac

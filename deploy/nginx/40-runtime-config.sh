#!/bin/sh
# Writes /tmp/runtime/env-config.js from container env vars so Flux/Akash/Docker
# "environmentParameters" work at RUNTIME (Vite VITE_* vars are otherwise baked at build time).
# Only an explicit allow-list of PUBLIC values is exposed to the browser. Never put secrets here.
set -eu
mkdir -p /tmp/runtime
OUT=/tmp/runtime/env-config.js
KEYS="VITE_SUPABASE_URL VITE_SUPABASE_PUBLISHABLE_KEY VITE_SUPABASE_PROJECT_ID VITE_WALLETCONNECT_PROJECT_ID VITE_SYSTEM_EXECUTION_MODE VITE_DEFAULT_SAFE_CHAIN"
{
  printf 'window.__APP_CONFIG__ = {'
  first=1
  for k in $KEYS; do
    eval "v=\${$k:-}"
    [ -z "$v" ] && continue
    # escape backslashes and double quotes
    esc=$(printf '%s' "$v" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g')
    [ $first -eq 1 ] || printf ','
    printf '"%s":"%s"' "$k" "$esc"
    first=0
  done
  printf '};\n'
} > "$OUT"
echo "runtime-config: wrote $OUT"

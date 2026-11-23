#!/bin/sh
# Writes /tmp/runtime/env-config.js from container env vars so Flux/Docker
# "environmentParameters" work at RUNTIME (Vite VITE_* vars are otherwise baked at build time).
# Only an explicit allow-list of PUBLIC values is exposed to the browser. Never put secrets here.
set -eu
mkdir -p /tmp/runtime
OUT=/tmp/runtime/env-config.js
# VITE_SUPABASE_URL is a legacy alias of VITE_API_URL (older Flux specs).
KEYS="VITE_API_URL VITE_PUBLIC_APP_URL VITE_WALLETCONNECT_PROJECT_ID VITE_SYSTEM_EXECUTION_MODE VITE_DEFAULT_SAFE_CHAIN VITE_AGENT_STATUS_URL VITE_SUPABASE_URL"
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

# ---------------------------------------------------------------------------
# Optional read-only proxy to the agent-runner status API (second Flux component).
# AGENT_STATUS_UPSTREAM=http://fluxrunner_<appname>:8090   (Flux container name of the runner)
# Only GET /agent-api/status and /agent-api/healthz are proxied. The runner itself has no
# write endpoints; its port is not published publicly.
PROXY=/tmp/runtime/nginx-agent.conf
rm -f "$PROXY"
UP="${AGENT_STATUS_UPSTREAM:-}"
if [ -n "$UP" ]; then
  if printf '%s' "$UP" | grep -Eq '^http://[A-Za-z0-9._-]+:[0-9]{2,5}$'; then
    cat > "$PROXY" <<NGINX
location ~ ^/agent-api/(status|healthz)\$ {
    limit_except GET { deny all; }
    resolver 127.0.0.11 valid=30s ipv6=off;
    set \$agent_upstream "$UP";
    proxy_pass \$agent_upstream/\$1;
    proxy_set_header Host \$host;
    proxy_hide_header Access-Control-Allow-Origin;
    proxy_connect_timeout 3s;
    proxy_read_timeout 10s;
    add_header Cache-Control "no-store" always;
    include /etc/nginx/snippets/security-headers.conf;
}
NGINX
    echo "runtime-config: agent status proxy -> $UP"
  else
    echo "runtime-config: ignoring invalid AGENT_STATUS_UPSTREAM (expected http://host:port)" >&2
  fi
fi

# ---------------------------------------------------------------------------
# Proxy to the own API (Flux component "api": SIWE auth + PostgREST + server functions).
# API_UPSTREAM=http://fluxapi_<appname>:8070  -> browser uses VITE_API_URL=/api (same origin).
# /sb/ is kept as a legacy alias for older builds.
API_PROXY=/tmp/runtime/nginx-api.conf
rm -f "$API_PROXY"
AUP="${API_UPSTREAM:-}"
if [ -n "$AUP" ]; then
  if printf '%s' "$AUP" | grep -Eq '^http://[A-Za-z0-9._-]+:[0-9]{2,5}$'; then
    cat > "$API_PROXY" <<NGINX
location ~ ^/(api|sb)/ {
    resolver 127.0.0.11 valid=30s ipv6=off;
    set \$api_upstream "$AUP";
    rewrite ^/(api|sb)/(.*)\$ /\$2 break;
    proxy_pass \$api_upstream;
    proxy_http_version 1.1;
    proxy_set_header Host \$http_host;
    proxy_set_header X-Forwarded-Host \$http_host;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    client_max_body_size 2m;
    proxy_connect_timeout 5s;
    proxy_read_timeout 130s;
    proxy_buffering off;
    add_header Cache-Control "no-store" always;
    include /etc/nginx/snippets/security-headers.conf;
}
NGINX
    echo "runtime-config: api proxy /api/ -> $AUP"
  else
    echo "runtime-config: ignoring invalid API_UPSTREAM (expected http://host:port)" >&2
  fi
fi

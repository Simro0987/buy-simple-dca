#!/bin/sh
# Flux mounts containerData (/appdata) owned by root, and files uploaded through the Flux
# volume browser (agents.json, keys/*.key) are root-owned too. Fix ownership/permissions,
# then drop to the unprivileged `node` user for the actual service.
set -eu
STATE_DIR="${STATE_DIR:-/appdata}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$STATE_DIR"
  chown -R node:node "$STATE_DIR" 2>/dev/null || true
  chmod -R go-rwx "$STATE_DIR" 2>/dev/null || true
  if su-exec node test -w "$STATE_DIR"; then
    exec su-exec node "$@"
  fi
  echo "entrypoint: WARNING $STATE_DIR not writable by node (no CAP_CHOWN?) - running as root" >&2
fi
exec "$@"

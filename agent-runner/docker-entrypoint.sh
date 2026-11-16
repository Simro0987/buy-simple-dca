#!/bin/sh
# Flux mounts containerData (/appdata) owned by root. Fix ownership once, then drop to the
# unprivileged `node` user for the actual service.
set -eu
STATE_DIR="${STATE_DIR:-/appdata}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$STATE_DIR"
  chown node:node "$STATE_DIR" 2>/dev/null || true
  chmod 0700 "$STATE_DIR" 2>/dev/null || true
  exec su-exec node "$@"
fi
exec "$@"

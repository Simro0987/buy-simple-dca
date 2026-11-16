#!/bin/sh
# Flux mounts /appdata owned by root and files uploaded through the Flux volume browser
# (secrets.env, import/*.sql) are root-owned. Fix ownership of OUR volume only (never the
# shared db secrets mount), then drop to the unprivileged `node` user (gid 1000 can read
# the db password file written by the db component).
set -eu
DATA_DIR="${DATA_DIR:-/appdata}"
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  chown -R node:node "$DATA_DIR" 2>/dev/null || true
  chmod -R go-rwx "$DATA_DIR" 2>/dev/null || true
  if su-exec node test -w "$DATA_DIR"; then
    exec su-exec node "$@"
  fi
  echo "entrypoint: WARNING $DATA_DIR not writable by node (no CAP_CHOWN?) - running as root" >&2
fi
exec "$@"

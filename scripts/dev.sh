#!/usr/bin/env bash
# Throwaway dev instance for UI work. Usage: scripts/dev.sh <name> <port>
# Login password: dev-password-123. The server serves dist/ from disk on every request,
# so after editing run `bun run build` and reload the page; no restart needed.
set -euo pipefail
name=$1
port=$2
cfg=/tmp/oomph-cfg-$name
if [ ! -e "$cfg/password" ]; then
  rm -rf "$cfg"
  printf 'dev-password-123\ndev-password-123\n' | OOMPH_CONFIG=$cfg bun server.ts passwd >/dev/null
fi
bun run build
unset OOMPH_LIFELINE # never let a dev instance steal/replace the real plugin's socket (started inside omp, it's inherited)
OOMPH_CONFIG=$cfg OOMPH_PORT=$port exec bun server.ts

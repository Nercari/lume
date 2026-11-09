#!/bin/sh
set -eu
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
if [ -x "$ROOT/runtime/node/bin/node" ]; then
  NODE="$ROOT/runtime/node/bin/node"
elif command -v node >/dev/null 2>&1; then
  NODE=node
else
  exit 1
fi
exec "$NODE" "$ROOT/companion/src/host.js" "$@"

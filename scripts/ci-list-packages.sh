#!/usr/bin/env bash
# Emit a JSON array of aggregate-smoke packages that exist in the checkout.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
canonical=(
  intake
  companion
  extension
  case-store
  extraction
  analysis
  chat-editor
  source-panel
  transfer
)

found=()
for pkg in "${canonical[@]}"; do
  if [[ -f "$root/$pkg/package.json" ]]; then
    found+=("$pkg")
  fi
done

if ((${#found[@]} == 0)); then
  echo '[]'
  exit 0
fi

printf '%s\n' "${found[@]}" | jq -R . | jq -s .

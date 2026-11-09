#!/usr/bin/env bash
# Install (when needed), build, and test one Lume package directory.
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "usage: $0 <package-dir>" >&2
  exit 2
fi

pkg="$1"
root="$(cd "$(dirname "$0")/.." && pwd)"
dir="$root/$pkg"

if [[ ! -f "$dir/package.json" ]]; then
  echo "missing package: $dir/package.json" >&2
  exit 1
fi

install_pkg() {
  local target="$1"
  local omit_optional="${2:-}"
  pushd "$root/$target" >/dev/null
  if [[ -f package-lock.json ]]; then
    if [[ -n "$omit_optional" ]]; then
      npm ci --omit=optional
    else
      npm ci
    fi
  elif jq -e '.dependencies // {} | length > 0' package.json >/dev/null 2>&1; then
    npm install
  fi
  popd >/dev/null
}

install_extraction_deps() {
  if [[ ! -f "$root/extraction/package.json" ]]; then
    echo "extraction package missing; cannot install pdfjs-dist" >&2
    exit 1
  fi
  (
    cd "$root/extraction"
    npm ci --omit=optional
  )
}

needs_extraction_deps() {
  case "$pkg" in
    analysis | chat-editor | source-panel | transfer) return 0 ;;
    *) return 1 ;;
  esac
}

case "$pkg" in
  extraction)
    install_extraction_deps
    ;;
  extension)
    install_pkg extension
    ;;
  *)
    if [[ -f "$dir/package-lock.json" ]]; then
      install_pkg "$pkg"
    fi
    if needs_extraction_deps; then
      # Build/tests import extraction, which loads pdfjs-dist at import time.
      install_extraction_deps
    fi
    ;;
esac

pushd "$dir" >/dev/null
if jq -e '.scripts.build' package.json >/dev/null 2>&1; then
  npm run build
fi
if [[ "$pkg" == "extension" ]]; then
  npx playwright-core install --with-deps chromium
fi
npm test
popd >/dev/null

echo "ci-test-package: $pkg ok"

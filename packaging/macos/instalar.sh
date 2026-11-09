#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_ROOT="${HOME}/Library/Application Support/Lume"
EXTENSION_ID='odjfiioakpihgkikmjadmohgckkhkjhi'

echo "Instalando Lume em $INSTALL_ROOT ..."
mkdir -p "$INSTALL_ROOT"
rsync -a --delete "$BUNDLE_ROOT/" "$INSTALL_ROOT/" --exclude lume-install 2>/dev/null || cp -R "$BUNDLE_ROOT/"* "$INSTALL_ROOT/"

echo ''
echo 'Chrome: chrome://extensions → Modo do desenvolvedor → Carregar sem compactacao:'
echo "  $INSTALL_ROOT/extension"
echo ''
echo 'ChatGPT: veja chatgpt/LEIA-ME.md nesta pasta.'
echo ''

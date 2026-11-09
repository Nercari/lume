#!/bin/sh
set -eu

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUNDLE_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INSTALL_ROOT="$HOME/Library/Application Support/Lume"
HOST_SH="$INSTALL_ROOT/macos/lume-host.sh"
MANIFEST_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST="$MANIFEST_DIR/com.lume.chatgpt.json"
EXTENSION_ID='odjfiioakpihgkikmjadmohgckkhkjhi'

echo "Instalando Lume em $INSTALL_ROOT ..."
mkdir -p "$INSTALL_ROOT"
rsync -a --delete "$BUNDLE_ROOT/" "$INSTALL_ROOT/" --exclude lume-install 2>/dev/null || cp -R "$BUNDLE_ROOT/"* "$INSTALL_ROOT/"
chmod +x "$HOST_SH" 2>/dev/null || true

mkdir -p "$MANIFEST_DIR"
cat >"$MANIFEST" <<EOF
{
  "name": "com.lume.chatgpt",
  "description": "Lume companion: Native Messaging host for the Lume extension",
  "path": "$HOST_SH",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://$EXTENSION_ID/"]
}
EOF

if ! command -v node >/dev/null 2>&1 && [ ! -x "$INSTALL_ROOT/runtime/node/bin/node" ]; then
  echo ''
  echo 'Node.js nao encontrado. O companion (login opcional) fica indisponivel.'
  echo 'O modo manual da extensao continua funcionando.'
  echo ''
fi

echo ''
echo 'Chrome: chrome://extensions → Modo do desenvolvedor → Carregar sem compactacao:'
echo "  $INSTALL_ROOT/extension"
echo ''

# Reproducible package layout

Part of #13. Describes the install tree produced by `node packaging/scripts/bundle.mjs`
and the smallest supported path for staff (Windows double-click, macOS/Linux shell installer).

## Build order

From the repository root:

```bash
cd extension && npm install && npm run build && npm test
cd ../companion && npm install && npm run build && npm test
node packaging/scripts/bundle.mjs --out ./lume-install [--node-win <node-v22-win-x64-dir>] [--zip ./lume-install.zip]
```

**Extension input:** `extension/dist/` (built MV3 tree).

**Companion input:** `companion/src/` + `companion/package.json` (Node ≥ 22 when the optional
companion is registered).

**Optional:** `manual/dist/` is copied when that directory exists (#2).

## Directory tree handed to staff (`lume-install/`)

```
lume-install/
  extension/              → extension/dist/
  companion/
    src/
    package.json
  manual/                 → optional, from manual/dist/
  runtime/node/           → optional, from --node-win (node.exe ~86 MB)
  windows/                → instalar.bat, instalar.ps1, lume-host.bat, desinstalar.*
  macos/                  → instalar.sh, lume-host.sh
  linux/                  → instalar.sh, lume-host.sh
  guias/
    LEIA-ME-PRIMEIRO.md   → one-page quick start (Portuguese)
    user-guide.md         → copy of packaging/docs/user-guide.md
    permissions-and-limits.md
  it/                     → managed-Chrome policy samples (BLOCKED on live GPO until verified)
  LICENSES/
  RELEASE-PIN.txt
  MANIFEST.txt            → sha256 of every bundled file (MANIFEST itself not hashed)
```

After `windows\instalar.bat`, staff load the extension from
`%LOCALAPPDATA%\Lume\extension`. The Windows installer registers Native Messaging under
**HKCU** only when Node is available (bundled `runtime\node` or `node.exe` on PATH).

Keep **real case exports**, **private evaluation manifests**, and **token exports** out of
the bundle. `bundle.mjs` refuses `*.pdf`, `private/`, `lume-private/`, calibration exports,
and files larger than 50 MB (except `runtime/node/node.exe`).

## Native messaging host manifest

Fixed extension id when keyed: `odjfiioakpihgkikmjadmohgckkhkjhi`. Host name:
`com.lume.chatgpt`. Windows manifest path points at `windows\lume-host.bat` under the install
root.

| OS | User install |
|----|----------------|
| Windows | HKCU registry → JSON under `%LOCALAPPDATA%\Lume\native-messaging\` |
| Linux | `~/.config/google-chrome/NativeMessagingHosts/` |
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` |

## Version pin file

`RELEASE-PIN.txt` records commit hash, extension/companion versions, extension id, build date.

## Managed distribution

See `lume-install/it/README.md`. Enterprise force-install uses
`ExtensionInstallForcelist` as an **array** of `extension_id;update_url` strings.

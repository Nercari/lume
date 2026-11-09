# Reproducible package layout

Part of #13. Describes the install tree produced by `node packaging/scripts/bundle.mjs`
and the smallest supported path for staff (Windows double-click, macOS/Linux shell installer).

## Build order

From the repository root:

```bash
cd extension && npm install && npm run build && npm test
npm test --prefix chatgpt
node packaging/scripts/bundle.mjs --out ./lume-install [--zip ./lume-install.zip]
```

**Extension input:** `extension/dist/` (built MV3 tree).

**ChatGPT input:** `chatgpt/PROJETO-LUME.md`, `LEIA-ME.md`, and `chatgpt/plugin/`.

**Optional:** `manual/dist/` is copied when that directory exists.

## Directory tree handed to staff (`lume-install/`)

```
lume-install/
  extension/              → extension/dist/
  chatgpt/                → project instructions + optional plugin
  manual/                 → optional, from manual/dist/
  runtime/node/           → optional, from --node-win (legacy; not required)
  windows/                → instalar.bat, instalar.ps1, desinstalar.*
  macos/                  → instalar.sh
  linux/                  → instalar.sh
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
`%LOCALAPPDATA%\Lume\extension`. Installers only copy files; they do not register a native host.

Keep **real case exports**, **private evaluation manifests**, and **token exports** out of
the bundle. `bundle.mjs` refuses `*.pdf`, `private/`, `lume-private/`, calibration exports,
and files larger than 50 MB (except `runtime/node/node.exe`).

## Version pin file

`RELEASE-PIN.txt` records commit hash, extension version, extension id, build date.

## Managed distribution

See `lume-install/it/README.md`. Enterprise force-install uses
`ExtensionInstallForcelist` as an **array** of `extension_id;update_url` strings.

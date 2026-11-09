# Reproducible package layout

Part of #13. Describes the install tree produced by `node packaging/scripts/bundle.mjs`
for **Windows** (simple file copy). No bundled Node.js runtime and no native host.

## Build order

From the repository root:

```bash
cd extension && npm install && npm run build && npm test
npm test --prefix chatgpt
node packaging/scripts/bundle.mjs --out ./lume-install [--zip ./lume-install.zip]
```

**Extension input:** `extension/dist/` (includes `manual/lume-pdf.html` for the case package page).

**ChatGPT input:** `chatgpt/PROJETO-LUME.md`, `LEIA-ME.md`, and `chatgpt/plugin/`.

## Directory tree handed to staff (`lume-install/`)

```
lume-install/
  extension/              → extension/dist/
  chatgpt/                → project instructions + optional plugin
  guias/
    LEIA-ME-PRIMEIRO.md   → one-page quick start (Portuguese)
    user-guide.md         → copy of packaging/docs/user-guide.md
    permissions-and-limits.md
  windows/                → instalar.bat, instalar.ps1, desinstalar.*
  it/                     → managed-Chrome policy samples (BLOCKED on live GPO until verified)
  LICENSES/
  MANIFEST.txt            → sha256 of every file; header lines pin commit, extension version, id, build date
```

After `windows\instalar.bat`, staff load the extension from
`%LOCALAPPDATA%\Lume\extension`. Installers only copy files (robocopy); they do not
require Node.js on the workstation.

Keep **real case exports**, **private evaluation manifests**, and **token exports** out of
the bundle. `bundle.mjs` refuses `*.pdf`, `private/`, `lume-private/`, `runtime/`,
calibration exports, and files larger than 50 MB.

## Managed distribution

See `lume-install/it/README.md`. Enterprise force-install uses
`ExtensionInstallForcelist` as an **array** of `extension_id;update_url` strings.

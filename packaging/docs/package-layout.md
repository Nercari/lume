# Reproducible package layout

Part of #13. Describes the smallest supported installation path for the MV3 extension and
the minimum Sign-in companion on a representative workstation (Linux or macOS with Google
Chrome ≥ 116). Windows follows the same logic with platform-specific host manifest paths.

## Build order

All commands run from the repository root. Versions are pinned by the commit you build;
record that commit in `packaging/RELEASE-PIN.txt` before handing the tree to staff.

```bash
cd extension && npm install && npm run build && npm test
cd ../companion && npm install && npm run build && npm test
```

**Extension output:** `extension/dist/` — load this folder as an unpacked extension.

**Companion output:** `companion/src/` executed by Node ≥ 22 on the host. There is no separate
bundle step today; `npm run build` checks syntax only.

Optional packages (`case-store`, UI libraries, transfer) ship inside the extension build as
that integration matures. This layout documents only what a nontechnical install needs on day
one: **extension + companion**.

## Directory tree handed to staff

```
lume-install/
  extension/          → copy of extension/dist/ (built MV3 tree)
  companion/
    src/              → companion source (or a maintainer-built single-file host later)
    package.json
  native-messaging/
    com.lume.chatgpt.json   → host manifest (see below)
  guides/
    user-guide.md             → copy from packaging/docs/user-guide.md
    permissions-and-limits.md
  RELEASE-PIN.txt             → git commit hash + extension manifest version
```

Keep **real case exports**, **private evaluation manifests**, and **token exports** out of
`lume-install/`. Synthetic samples belong in a separate folder marked `synthetic-only`.

## Native messaging host manifest

Chrome expects a manifest named `com.lume.chatgpt.json` (lowercase alphanumerics, dots,
underscores). Adjust `path` to the absolute companion entry script on the workstation.

```json
{
  "name": "com.lume.chatgpt",
  "description": "Lume companion: Sign in with ChatGPT for the Lume extension",
  "path": "/ABSOLUTE/PATH/TO/companion/src/host.js",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://EXTENSION_ID_HERE/"]
}
```

Install locations (Chrome documentation):

| OS | User install |
|----|----------------|
| Linux | `~/.config/google-chrome/NativeMessagingHosts/` |
| macOS | `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/` |
| Windows | Registry + manifest beside the host binary (maintainer documents path) |

After loading the unpacked extension, copy its 32-character extension ID into
`allowed_origins`. Only that origin may call the host (#5).

## Managed distribution (BLOCKED until policy)

Enterprise Chrome can push the extension via policy (`ExtensionInstallForcelist`). That path
needs institution approval, an update URL, and often code signing. Document the policy IDs here
when #14 records release evidence; do not infer permission from this file alone.

## Version pin file

`RELEASE-PIN.txt` example:

```
commit=abc1234
extension_version=0.0.1
companion_version=0.0.0
built=2026-11-09
```

Staff compare `chrome://extensions` and the companion `--version` output (when added) against
this file after updates.

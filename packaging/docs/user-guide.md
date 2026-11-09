# Lume installation guide (staff)

Lume helps you read a PJe case in Chrome, build a local **case package**, and work in **your own ChatGPT plan**. Lume does **not** offer a paid API key. Never paste tokens.

## Before you start

- You need permission to work on the case in PJe with your normal login.
- You need access to ChatGPT with a plan that allows Projects (or plugin install, if your organization offers it).
- Ask IT for the **`lume-install`** folder from the maintainer, not a random download.

## Install the extension

1. IT copies `lume-install` to your machine (for example `%LOCALAPPDATA%\Lume` on Windows).
2. Open Chrome → `chrome://extensions`.
3. Turn on **Developer mode** if IT allows it (managed installs may use enterprise policy instead).
4. Click **Load unpacked** and choose the `extension` folder inside `lume-install`.
5. Pin the Lume side panel if helpful.

## Set up ChatGPT (once)

1. Open `lume-install/chatgpt/LEIA-ME.md` and follow **Opção 1**:
   - ChatGPT → **Projects** → **New project** named **Lume**.
   - Paste the contents of `PROJETO-LUME.md` into **Instructions** and save.
2. Optional: install the plugin from `chatgpt/plugin/` if your plan supports Agent Plugins.

## Daily workflow

1. Sign in to PJe in Chrome as usual.
2. Open the Lume side panel on the case.
3. Click **Gerar pacote do caso** to open the manual page, load the PDF you downloaded from PJe, and save the `.md` package.
4. Paste the package into your **Lume** ChatGPT project and ask for summaries, timelines, or drafts.
5. Review every citation `[Id X, fl. Y]` before using text in court systems.

## Update Lume

1. IT provides a new `lume-install` folder or managed update.
2. Reload the unpacked extension or let policy refresh the CRX.

## Remove case data

- Delete local Lume case stores only through the product controls when available ([#7](../case-store/docs/design.md)).
- Remove downloaded `.md` packages and PDFs according to your court’s file policy.

## Uninstall Lume

1. Remove the extension in `chrome://extensions`.
2. Run `windows\desinstalar.bat` or delete the install folder IT created (`%LOCALAPPDATA%\Lume` on Windows).
3. Remove any ChatGPT Project you no longer need (your ChatGPT account settings).

## Troubleshooting

| Symptom | What to try |
|--------|----------------|
| Panel says layout not recognized | Use **Modo calibração** and send the JSON to IT/maintainer. |
| Package page will not open | Rebuild or reinstall `extension/dist` with the manual bundle. |
| ChatGPT ignores citations | Confirm Project instructions still contain `PROJETO-LUME.md`. |

For permissions and limits, see `permissions-and-limits.md`.

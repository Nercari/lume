# Lume installation guide (staff)

Lume helps you read a PJe case in Chrome and work in **your own ChatGPT plan**. Lume does **not** offer a paid API key. Never paste tokens. Nothing leaves the computer except what you send in ChatGPT.

## Before you start

- You need permission to work on the case in PJe with your normal login.
- You need access to ChatGPT with a plan that allows Projects.
- Ask IT for the **`lume-install`** folder from the maintainer, not a random download.

## Install the extension

1. IT copies `lume-install` to your machine (for example `%LOCALAPPDATA%\Lume` on Windows).
2. Chrome → `chrome://extensions` → **Load unpacked** → the `extension` folder. Turn on **Developer mode** only if IT allows it.
3. Pin the Lume icon. A click opens the side panel.

## Set up ChatGPT

1. Open `lume-install/chatgpt/LEIA-ME.md` and follow **Opção 1**:
   - ChatGPT → **Projects** → **New project** named **Lume**.
   - Paste the contents of `PROJETO-LUME.md` into **Instructions** and save.
2. Open the official ChatGPT side panel on the PJe tab, in a regular chat. It reads the page Lume opens. The extension does not attach files and does not store a project address.
3. Optional: install the plugin from `chatgpt/plugin/` if your plan supports Agent Plugins.

## Daily workflow

1. Sign in to PJe in Chrome and open the case.
2. Click **Estudar processo**.
3. Read the case on the PJe tab (`#lume-autos`) in the ChatGPT side panel. **Salvar partes** and **Copiar parte k** are on the study page. A page number in `[ID X, pág. Y]` appears only when the document states it.

The manual page is the fallback: **Gerar pacote do caso**, then the PDF you downloaded in PJe (Download dos autos).

## Update Lume

1. IT provides a new `lume-install` folder or managed update.
2. Reload the unpacked extension or let policy refresh the CRX.

## Remove case data

- The one-click study does not write the case to disk unless you click **Salvar partes**.
- Delete any saved `.md` parts and PDFs according to your court’s file policy.
- **Carregar perfil** stores only a selector profile, not case text.

## Uninstall Lume

1. Remove the extension in `chrome://extensions`.
2. Run `windows\desinstalar.bat` or delete the install folder IT created (`%LOCALAPPDATA%\Lume` on Windows).
3. Remove any ChatGPT Project you no longer need (your ChatGPT account settings).

## Troubleshooting

| Symptom | What to try |
|--------|----------------|
| Panel says it cannot find the document list | Open **Calibrar PJe** on the case, click **Salvar calibração**, and send `lume-calibracao.json` to the maintainer. The file has no case text. |
| The side panel does not show the case | Stay on the PJe tab whose address ends in `#lume-autos`. Use **Parte seguinte** for the next part, or **Copiar parte k** / **Salvar partes** on the study page. |
| Package page will not open | Rebuild or reinstall `extension/dist` with the manual bundle. |
| ChatGPT ignores citations | Confirm Project instructions still contain `PROJETO-LUME.md`. |

Live PJe selectors ship unverified until a calibration file from a real case is reviewed. For permissions and limits, see `permissions-and-limits.md`.

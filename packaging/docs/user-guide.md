# Lume installation guide (staff)

Lume helps you read a PJe case in Chrome and work in **your own ChatGPT plan**. Lume does **not** offer a paid API key. Never paste tokens. Nothing leaves the computer except what you send in ChatGPT.

## Before you start

- You need permission to work on the case in PJe with your normal login.
- You need access to ChatGPT with a plan that allows Projects.
- Ask IT for the **`lume-install`** folder from the maintainer, not a random download.

## Install the extension

1. IT copies `lume-install` to your machine (for example `%LOCALAPPDATA%\Lume` on Windows).
2. Open Chrome → `chrome://extensions`.
3. Turn on **Developer mode** if IT allows it (managed installs may use enterprise policy instead).
4. Click **Load unpacked** and choose the `extension` folder inside `lume-install`.
5. Pin the Lume icon if helpful. A click opens the side panel.

## Set up ChatGPT

1. Open `lume-install/chatgpt/LEIA-ME.md` and follow **Opção 1**:
   - ChatGPT → **Projects** → **New project** named **Lume**.
   - Paste the contents of `PROJETO-LUME.md` into **Instructions** and save.
2. Open the Lume panel once and check **URL do Projeto Lume**. The default is `https://chatgpt.com/`. If the project has its own `https://chatgpt.com/...` address, paste that once. It stays in this browser.
3. Optional: install the plugin from `chatgpt/plugin/` if your plan supports Agent Plugins.

## Daily workflow

1. Sign in to PJe in Chrome as usual and open the case.
2. Click the Lume icon. The side panel opens.
3. Click **Estudar processo**.
4. Lume fetches each document's own PDF or image, in timeline order, through the session already open in that tab (in memory, no download dialog and no file on disk) and runs OCR on this computer. It then opens the same PJe address with `#lume-autos`. That tab is the full case, so the ChatGPT side panel can read it. **Copiar tudo** is on that tab. Attaching the part files in ChatGPT stays available from the study page. The full-autos PDF is not this path.
5. The prompt is already filled. Read it and send it yourself. Lume does not send the message.
6. Review every citation `[Id X, fl. Y]` before using text in court systems.

If attach fails, the study page says so. Use **Anexar no ChatGPT** to try again, or **Salvar partes** to download the files and attach them yourself.

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
| ChatGPT opens without the files | On the study page, click **Anexar no ChatGPT**. If it still fails, **Salvar partes** and attach the files yourself. |
| Package page will not open | Rebuild or reinstall `extension/dist` with the manual bundle. |
| ChatGPT ignores citations | Confirm Project instructions still contain `PROJETO-LUME.md`. |

Live PJe selectors ship unverified until a calibration file from a real case is reviewed. For permissions and limits, see `permissions-and-limits.md`.

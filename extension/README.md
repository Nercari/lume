# Lume extension (one click on the open PJe case)

A Chrome MV3 extension. Pedro opens a case in PJe (already signed in) and clicks **Lume: Estudar processo** on that page. Lume reads every timeline document through that browser session, turns it into text on this computer (including Portuguese OCR), and opens the same PJe address with `#lume-autos` so the ChatGPT side panel can read the case. It does not attach files to chatgpt.com.

The selector profiles in `src/profile.js` are **UNVERIFIED**. Nobody has checked them against a live PJe page. **Calibrar PJe** records only page structure and URL patterns. Load the resulting profile with **Carregar perfil** after it is reviewed. Until then, a miss stops and names the role or the URL rule. Nothing is skipped quietly.

The panel shows three steps: open the case, click **Estudar processo**, read the PJe tab in the ChatGPT side panel. Portuguese OCR uses `dist/manual/ocr/por.traineddata.gz` from the extension package. The worker, the wasm, and that model are loaded with `chrome.runtime.getURL`. They are not fetched from a CDN.

The manual PDF page stays as the fallback: **Gerar pacote do caso**.

## Relatório e minuta no plano ChatGPT

On the study page, after the case is in memory, the user picks a model and clicks **Gerar relatório e minuta** once. Lume asks the worker for access (`lume:siwc-access`), lists models with `GET https://api.openai.com/v1/models`, and streams `POST https://api.openai.com/v1/responses` with `store: false` and `stream: true`. The model slug is whatever the account catalog returns. Nothing in this extension names a model. Success is only a `response.completed` event. A 401 asks the worker for access one more time and then stops. Quota pauses the run and keeps the checkpoint. A cut stream, `response.incomplete`, `response.failed`, or a coverage miss shows **INCOMPLETO** and never **pronto**.

The run is one request per `lume-caso/1` part (notes, tags, and an `IDS-LIDOS:` line), then one relatório request (the notes plus part 1 Índice and Lacunas), then one minuta request. The method text is the flattened plugin (`jef-director`, `jef-pacote`, `jef-relatorio`, `jef-voto`, `jef-revisao`) copied to `dist/metodo/` at build time. The extension source does not contain that text. Checkpoints sit in `chrome.storage.session`, keyed by the case, and **Retomar** continues after a quota pause, a token refresh, or **Cancelar**. The chosen model slug is remembered in `chrome.storage.local`. Tokens are not.

If the worker says the user is signed out, the page shows **Entre com ChatGPT no painel do Lume**. A `data-sigilo` row is still read. The study page shows one warning line and does not disable **Gerar**.

Plano B, when there is no sign-in or no quota: use the case tab in the ChatGPT side panel with the Lume JEF plugin.

Live inference stays blocked until Pedro signs in on his own ChatGPT plan. These tests use synthetic fixtures only.

A private directory of `.html`, `.pdf`, and `.png` files can be timed without printing their contents:

```
npm run bench:fixture -- <dir> --latency 150
```

## Build and test

```
cd extension
npm install
npm run build    # writes dist/, a loadable unpacked extension
npm test         # node:test, then one Playwright run against local fixtures
```

`npm test` needs the Chromium build that `npx playwright-core install chromium` downloads. The Playwright test does not open a real court site: it answers the PJe host with local HTML. The build also copies the flattened JEF method into `dist/metodo/`.

Load `extension/dist/` in `chrome://extensions` with "Load unpacked". The build copies `manual/dist/` to `dist/manual/` (pdf.js worker and the OCR files). If that directory is missing, the build runs the manual package build first.

## What one click does

1. The content script, on `pje1g` or `pje2g` only, fetches with `credentials: 'same-origin'`. The browser attaches the PJe session. Lume never reads cookies, tokens or certificates, and it does not write files during the read.
2. The default profile targets the `listAutosDigitais` timeline (UNVERIFIED until calibration). Each entry's id comes from the row, its onclick, or its document URL, in that order. Named URL rules in `src/url-rules.js` decide which links are documents. A link that matches none is listed and is not fetched. The study fetches each document's own PDF or image in memory, in timeline order, and OCRs that binary. It does not open a download dialog and it does not use `chrome.downloads`. The full-autos PDF is optional: only a stored profile with `useDownloadAutos: true` fetches that endpoint instead. The default pause between document fetches is 300 ms. The panel checkbox **pausa entre documentos** turns that pause off.
3. Bytes move to `study.html` on a `chrome.runtime.Port`, in 64 KiB slices (`src/chunks.js`). One `sendMessage` would have to clone the whole PDF. A port can show "Documento k de N", can be cancelled, and a missing slice is an error instead of a short file. The service worker only forwards slices.
4. `study.html` uses the manual package's pdf.js and `manual/src/ocr.js` (tesseract.js, Portuguese `por.traineddata.gz` under `dist/manual/ocr/`). HTML and plain text become text directly. A PDF page with a text layer is read by pdf.js. A page with no text, and a jpeg/png/tiff document, go through local OCR. The case result keeps the timeline id. A document page number is kept only when the file says it.
5. The extension splits the case at 350000 characters (about 100k tokens). The splitter is `renderCaseParts` in `src/case-view.js`. It does not import `manual/src/parts.js`. Each part is `lume-caso-parte-01-de-NN.md`. The file starts with front-matter `formato`, `processo`, `parte`, `total`, `ids`, and `origem: botao`, then the body. The PJe view shows that body in `article#lume-caso` (`data-formato="lume-caso/1"`, `data-origem="botao"`) and `pre[data-lume-texto]`. Part 1 carries the master index. The study page offers **Salvar partes** and **Copiar parte k**.
6. The case page has a fixed button **Lume: Estudar processo** (`#lume-estudar`). Its label and the tab title show `Lume: estudando · k/N` while documents are read, `Lume: falhou · …` when the read stops, and the case tab shows `Lume: pronto · N docs · L lacunas · parte 1 de T` when the view is ready. The study opens the same PJe URL with `#lume-autos` and `attach=0` (no ChatGPT attach). The content script keeps that case's parts in the tab and will not paint a view whose page URL is different. The tab shows the full case in timeline order: process counts, an index (ID, tipo, data, páginas do documento, situação), the gap list, and each passage tagged `[ID X, pág. Y]` only when the document page is known. A long case is `Parte k de N`, with the index in part 1 and previous and next links, so the ChatGPT side panel can read one part at a time.

## Permissions

| Item | Value | Why |
|------|-------|-----|
| `permissions` | `sidePanel`, `storage` | The panel and one selector profile. Case text is not stored there. |
| `host_permissions` | none | The content script runs on the PJe hosts below. No ChatGPT host permission. |
| content scripts | `https://pje1g.trf1.jus.br/*`, `https://pje2g.trf1.jus.br/*` | Read the open case and paint `#lume-autos`. |
| CSP | `script-src 'self' 'wasm-unsafe-eval'` | pdf.js and tesseract. No remote script. |

## Calibrar PJe

The link asks for one snapshot, then records each click (tag, masked id, classes, attribute names, URL pattern) until **Salvar calibração**. The download is `lume-calibracao.json`. The panel says to send that file to Grok. Digit runs in URLs become `N`. Query values are dropped. Parameter names stay. Resource sizes are buckets. A version token such as `2.4.1` may be kept. Text, names, CPF and case numbers are not.

**Carregar perfil** stores a JSON profile in `chrome.storage.local`. It is tried before the built-in unverified profiles.

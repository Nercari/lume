# Lume extension (one click on the open PJe case)

A Chrome MV3 extension. Pedro opens a case in PJe (already signed in) and clicks **Estudar processo**. Lume reads every document through that browser session, turns it into text on this computer (including OCR), and opens the ChatGPT project with the part files attached. It does not send the message.

The selector profiles in `src/profile.js` are **UNVERIFIED**. Nobody has checked them against a live PJe page. **Calibrar PJe** records only page structure and URL patterns. Load the resulting profile with **Carregar perfil** after it is reviewed. Until then, a miss stops and names the role or the URL rule. Nothing is skipped quietly.

The manual PDF page stays as the fallback: **Gerar pacote do caso**.

## Build and test

```
cd extension
npm install
npm run build    # writes dist/, a loadable unpacked extension
npm test         # node:test, then one Playwright run against local fixtures
```

`npm test` needs the Chromium build that `npx playwright-core install chromium` downloads. The Playwright test does not open a real court site or chatgpt.com: it answers those host names with local HTML.

Load `extension/dist/` in `chrome://extensions` with "Load unpacked". The build copies `manual/dist/` to `dist/manual/` (pdf.js worker and the OCR files). If that directory is missing, the build runs the manual package build first.

## What one click does

1. The content script, on `pje1g` or `pje2g` only, fetches with `credentials: 'same-origin'`. The browser attaches the PJe session. Lume never reads cookies, tokens or certificates, and it does not write files during the read.
2. The default profile targets the `listAutosDigitais` timeline (UNVERIFIED until calibration). Each entry's id comes from the row, its onclick, or its document URL, in that order. Named URL rules in `src/url-rules.js` decide which links are documents. A link that matches none is listed and is not fetched. The study fetches each document's own PDF or image in memory, in timeline order, and OCRs that binary. It does not open a download dialog and it does not use `chrome.downloads`. The full-autos PDF is optional: only a stored profile with `useDownloadAutos: true` fetches that endpoint instead.
3. Bytes move to `study.html` on a `chrome.runtime.Port`, in 64 KiB slices (`src/chunks.js`). One `sendMessage` would have to clone the whole PDF. A port can show "Documento k de N", can be cancelled, and a missing slice is an error instead of a short file. The service worker only forwards slices.
4. `study.html` uses the manual package's pdf.js and `manual/src/ocr.js` (tesseract.js, Portuguese, local files under `dist/manual/ocr/`). HTML becomes text. A PDF page with no text layer, and a jpeg/png/tiff document, go through OCR. The case result keeps the PJe id from the list and `fl.` as the page inside that document.
5. Parts come from `buildCasePackParts` when `manual/src/parts.js` exports it, with `maxChars` 350000 (about 100k tokens). A case at or under that size stays one file. Until the export exists, the study page attaches one `lume-caso-parte-01-de-01.md` from `buildCasePack` (the full pack, not a cut).
6. The study opens the same PJe URL with `#lume-autos`. The content script replaces that tab with the full case in timeline order (index ID, tipo, data, páginas, situação, gaps, and `[ID X, pág. Y]`). Document page and PDF page stay distinct. A case above about 100k tokens is split into `Parte k de N` with previous and next links, so the ChatGPT side panel can read one part at a time. **Copiar tudo** copies the whole text. The part files are still attached on chatgpt.com as a second path. `chatgpt.js` does not press send.

## Permissions

| Item | Value | Why |
|------|-------|-----|
| `permissions` | `sidePanel`, `storage` | The panel, one selector profile, and the ChatGPT project URL. Case text is not stored there. |
| `host_permissions` | `https://chatgpt.com/*` | The attach script. No other host permission. |
| content scripts | `https://pje1g.trf1.jus.br/*`, `https://pje2g.trf1.jus.br/*`, `https://chatgpt.com/*` | PJe read and ChatGPT attach. |
| CSP | `script-src 'self' 'wasm-unsafe-eval'` | pdf.js and tesseract. No remote script. |

## Calibrar PJe

The link asks for one snapshot, then records each click (tag, masked id, classes, attribute names, URL pattern) until **Salvar calibração**. The download is `lume-calibracao.json`. The panel says to send that file to Grok. Digit runs in URLs become `N`. Query values are dropped. Parameter names stay. Resource sizes are buckets. A version token such as `2.4.1` may be kept. Text, names, CPF and case numbers are not.

**Carregar perfil** stores a JSON profile in `chrome.storage.local`. It is tried before the built-in unverified profiles.

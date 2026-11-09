# Lume extension (MV3 adapter, #4)

A Chrome MV3 extension. It reads the document inventory of the PJe case that is open in the current tab (TRF1/SJDF, first instance). It reads only through the browser's own session. It does not navigate, click, log in or export anything.

## Build and test

```
cd extension
npm install      # no dependencies
npm run build    # writes dist/, a loadable unpacked extension
npm test         # node:test, small DOM mocks, no network
```

Load `extension/dist/` in `chrome://extensions` with "Load unpacked". The build copies `manual/dist/` to `dist/manual/`. If that directory is missing, the build runs `npm --prefix ../manual ci` and `npm --prefix ../manual run build`. If that fails, run those two commands from the extension directory and build again.

## Permissions

| Item | Value | Why |
|------|-------|-----|
| `permissions` | `sidePanel`, `storage` | The panel sits next to the PJe tab. `storage` keeps one selector profile the user loads. It does not keep case contents. `chrome.tabs.create` for the PDF page needs no extra permission. |
| `content_security_policy.extension_pages` | `script-src 'self' 'wasm-unsafe-eval'; object-src 'self'` | pdf.js compiles some PDF calculator functions with `WebAssembly.Module`. The default extension policy blocks that. `'wasm-unsafe-eval'` is the only extra source. There is no `'unsafe-eval'` and no `'unsafe-inline'`. |
| `content_scripts.matches` | `https://pje1g.trf1.jus.br/*`, `https://pje2g.trf1.jus.br/*` | The content script runs only on TRF1 PJe (first and second instance). A static match gives the script same-origin access, so the manifest has no `host_permissions`. |
| none | `tabs`, `cookies`, `downloads`, `webRequest`, `scripting` | Not requested. `chrome.tabs.sendMessage` and `chrome.tabs.create` need no permission. The calibration file is saved with an `<a download>` blob. Case persistence belongs to #7. |

The content script fetches with `credentials: 'same-origin'` from the page's own origin. It never reads cookies, tokens or certificates. A cross-origin link stops the read. Requests run one at a time, with no rate inference.

## How a read works

- The adapter binds every read to the visible case number and navigation state. A case switch or a navigation starts a new epoch, aborts in-flight work and drops the old inventory.
- It walks the document list from page 1 to the last page, attachments included. For each row it records the ID, version, kind, parent ID and the expected page count when the list shows it.
- Each item ends in one explicit state: `processed`, `restricted`, `missing`, `unsupported` or `failed`. Items the read did not reach stay `pending`. Nothing is dropped. `restricted` means the server answered HTTP 403, not a list flag.
- `processed` means only that the document is reachable and has a supported type (PDF or HTML). Text extraction is #2.
- A read stops safely on `session_expired`, `incompatible_layout`, `invalidated`, `inventory_changed` or `stopped_by_user`. At the end it reads page 1 again. A different list gives `inventory_changed`.

## Limits

- The selector profiles in `src/profile.js` are **UNVERIFIED**. Nobody has seen a permitted real case yet. The first profile that matches every role is used. If a role matches nothing, the panel names that role and stops. It does not guess.
- The snapshot and the reader also look at same-origin iframes the top frame can open. A cross-origin frame is counted and not read. The content script itself stays in the top frame.
- Row id, version and list attributes are still the placeholder names (`data-id`, `data-versao`, `data-sigilo`). A `data-sigilo` marker does not skip the row; only a real HTTP 403 yields `restricted`. A live list that uses other attribute names stops instead of dropping the row.
- For a document, the adapter checks the status and content type. It cancels the body of a non-HTML response (for example a PDF) unread. It reads an HTML response in full, to detect a login page. The size of an HTML response has no limit.
- The panel ignores a state from an older epoch of the same page load. A new page load has a new load ID, so its states always show. A tab navigation clears the inventory. The panel then asks the new page. Outside PJe it shows `not_pje`, **Gerar pacote do caso**, and the line "Baixe o processo completo no PJe (Download dos autos) e abra o PDF aqui." The inventory controls on a PJe tab are unchanged.
- **Gerar pacote do caso** opens `manual/lume-pdf.html` in a new tab (`chrome.tabs.create` of `chrome.runtime.getURL`). **Modo calibração** is a secondary link. The toolbar icon opens the side panel on any tab. If the side panel cannot be armed, that click opens the same manual page.
- The PDF page is the manual package build: one HTML file, `lume-pdf.js`, and `pdf.worker.mjs`. Scripts are external modules from the extension origin. The worker is a module worker. Nothing is loaded from the network.
- DOM changes are debounced (250 ms) before the visible case is checked again. Each read checks the visible case itself before it uses a response.

## Calibração

O botão **Modo calibração** pede ao content script um retrato só da estrutura da página aberta (e dos iframes de mesma origem que ele consegue abrir). Cada elemento guarda etiqueta, id com sequências longas de dígitos trocadas por `#` (por exemplo `j_id#`, `docs:#:link`), classes, nomes de atributos, quantidade de filhos e profundidade. Os únicos valores copiados são `role`, `type` e o caminho do `href`, sem consulta e sem dígitos longos. Não entram texto, valores de campo, `title`, `alt`, `aria-label` nem valores `data-*`. A captura para em 5000 nós e o painel diz quando isso acontece.

O JSON não contém conteúdo do processo. Pode ser enviado ao mantenedor. **Baixar JSON de calibração** grava `lume-calibracao-<data>.json` por um link com `download` (sem permissão `downloads`). **Copiar** põe o mesmo JSON na área de transferência.

Se a leitura não acha um papel, o painel diz qual foi — por exemplo «Não encontrei a lista de documentos» — e indica o Modo calibração ou o PDF completo do processo (Download dos autos).

**Carregar perfil** instala um JSON em `chrome.storage.local`. Esse perfil passa a ser o primeiro candidato, sem gerar a extensão de novo. O objeto tem de ter exatamente estas chaves: `id`, `unverified` (booleano), e listas `layoutMarker`, `docList`, `docRow`, `openLink`, `login`, `caseNumber` (`{ "selector", "mode": "text" | "cnj" }`) e `pagination` (`nextPage`, `firstPage`, `pageInfo`). Seletores genéricos (`div`, `a`, `table`, …) são recusados. Um campo a mais ou a menos também.

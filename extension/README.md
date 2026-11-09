# Lume extension (MV3 adapter, #4)

A Chrome MV3 extension. It reads the document inventory of the PJe case that is open in the current tab (TRF1/SJDF, first instance). It reads only through the browser's own session. It does not navigate, click, log in or export anything.

## Build and test

```
cd extension
npm install      # no dependencies
npm run build    # writes dist/, a loadable unpacked extension
npm test         # node:test, small DOM mocks, no network
```

Load `extension/dist/` in `chrome://extensions` with "Load unpacked".

## Permissions

| Item | Value | Why |
|------|-------|-----|
| `permissions` | `sidePanel` | Shows the panel next to the PJe tab. |
| `content_scripts.matches` | `https://pje1g.trf1.jus.br/pje/*` | The content script runs only on the TRF1 first-instance PJe. A static match gives the script same-origin access, so the manifest has no `host_permissions`. |
| none | `tabs`, `storage`, `cookies`, `webRequest`, `scripting` | Not requested. `chrome.tabs.sendMessage` needs no permission. Persistence belongs to #7. |

The content script fetches with `credentials: 'same-origin'` from the page's own origin. It never reads cookies, tokens or certificates. A cross-origin link stops the read. Requests run one at a time, with no rate inference.

## How a read works

- The adapter binds every read to the visible case number and navigation state. A case switch or a navigation starts a new epoch, aborts in-flight work and drops the old inventory.
- It walks the document list from page 1 to the last page, attachments included. For each row it records the ID, version, kind, parent ID and the expected page count when the list shows it.
- Each item ends in one explicit state: `processed`, `restricted`, `missing`, `unsupported` or `failed`. Items the read did not reach stay `pending`. Nothing is dropped.
- `processed` means only that the document is reachable and has a supported type (PDF or HTML). Text extraction is #2.
- A read stops safely on `session_expired`, `incompatible_layout`, `invalidated`, `inventory_changed` or `stopped_by_user`. At the end it reads page 1 again. A different list gives `inventory_changed`.

## Limits

- The selectors in `src/core.js` (`PROFILE`) are **UNVERIFIED placeholders**. Nobody has seen a permitted real case yet. Calibrate them through the #3 route and #5 before live use. An unknown page fails the layout check and stops.
- Only `pje1g` is matched. The second instance (`pje2g`) is out of scope.
- The content script runs in the top frame only.
- For a document, the adapter checks the status and content type. It cancels the body of a non-HTML response (for example a PDF) unread. It reads an HTML response in full, to detect a login page. The size of an HTML response has no limit.
- The panel ignores a state from an older epoch of the same page load. A new page load has a new load ID, so its states always show. A tab navigation clears the panel. The panel then asks the new page, and a page outside PJe leaves the panel clear.
- DOM changes are debounced (250 ms) before the visible case is checked again. Each read checks the visible case itself before it uses a response.

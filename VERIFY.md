# VERIFY

This file is the merge evidence for this repo. Update it in the same PR when behavior changes.

## Commands

- Test one package: `npm test --prefix <package>` (packages: intake, chatgpt, extension, case-store, extraction, analysis, chat-editor, source-panel, transfer, packaging, trust, validation). Packages that import `extraction` need `npm ci --omit=optional --prefix extraction` first.
- Hosted CI runs the same package tests in the per-package workflows under `.github/workflows/`.

## Essential check

GREEN for a merge: `hq_onboard_repo.py merge N --repo Nercari/lume` runs these commands on main with the PR head merged in and posts `verify/essential`. They are offline, finish in seconds, and need no installed dependencies. The unit tests run in each PR's own PROOF CMD and in hosted CI, not here.

```
npm run build --prefix intake
npm run lint:public --prefix intake
npm test --prefix chatgpt
npm run build --prefix case-store
npm run build --prefix extension
```

## Synthetic one-click eval

The one-click eval scores capture, state and OCR accuracy on three generated cases. It needs the Playwright Chromium that `npm test` uses, stays on localhost, and is not a CI gate.

```
cd extension && npm ci && npm run build && npm run eval:synthetic
```

`npm run eval:synthetic -- --runs N --latency MS` changes the run count (default 3) and the simulated PJe latency (default 150 ms). The command prints one JSON line: `documentsCaptured` over `documentsExpected`, `captureRate`, `stateMatches` over `stateExpected`, `stateMismatches` by synthetic id, `sigiloWarningShown`, `ocr.cer` and `ocr.wer` over `ocr.pages`, the median `totalSec` and `latencyMs`. Capture and OCR come from the first run; a mismatch seen in any run is listed; the time is the median over the case runs. It carries no document text. Paste the line in the PR.

## Document fetch waves (ready time)

`collectCase` fetches a case in waves of at most `DOCUMENT_FETCH_LIMIT` (4) documents. The pause from the panel (`DOCUMENT_PAUSE_MS`, "pausa entre documentos") now runs between waves, not between every document; `lumePauseMs: 0` still removes it. A wave resolves before its documents are classified and delivered, in list order, so the pack order, the per-document states and the sigilo, restricted and corrupt handling are unchanged.

Measured on 2026-11-11 with the synthetic eval above (3 cases, 27 documents, 3 runs, median):

```
before, 150 ms: {"latencyMs":150,"totalSec":4.38,"captureRate":1,"stateMatches":27,"ocr":{"pages":9,"cer":0,"wer":0}}
after,  150 ms: {"latencyMs":150,"totalSec":1.88,"captureRate":1,"stateMatches":27,"ocr":{"pages":9,"cer":0,"wer":0}}
before, 0 ms:   {"latencyMs":0,"totalSec":3.39,"captureRate":1,"stateMatches":27,"ocr":{"pages":9,"cer":0,"wer":0}}
after,  0 ms:   {"latencyMs":0,"totalSec":1.38,"captureRate":1,"stateMatches":27,"ocr":{"pages":9,"cer":0,"wer":0}}
```

`npm test --prefix extension` covers the wave cap, the order, the abort and one failed fetch kept to its own document.

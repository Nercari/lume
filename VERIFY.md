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

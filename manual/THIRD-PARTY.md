# Third-party notices for `manual/dist`

`npm run build` copies these files next to the page. The running page does not fetch them from a network.

## PDF.js

- Package: `pdfjs-dist` 6.4.299
- License: Apache-2.0
- Copyright: Mozilla and contributors
- File: `dist/pdf.worker.mjs`
- https://github.com/mozilla/pdf.js

## Tesseract.js

- Package: `tesseract.js` 7.0.0
- License: Apache-2.0
- File: `dist/ocr/worker.min.js`
- https://github.com/naptha/tesseract.js

The page sets `workerPath`, `corePath` and `langPath` to those local files and sets `workerBlobURL: false`. The worker is a same-origin script, which is what the extension page CSP allows (`script-src 'self' 'wasm-unsafe-eval'`).

## Tesseract.js core

- Package: `tesseract.js-core` 7.0.0
- License: Apache-2.0
- https://github.com/naptha/tesseract.js-core

Only the LSTM builds are shipped:

- `dist/ocr/tesseract-core-simd-lstm.wasm.js` (used first)
- `dist/ocr/tesseract-core-lstm.wasm.js` (fallback when SIMD fails to start)

In this version the browser file embeds the wasm and `importScripts` loads that file. `corePath` is the SIMD file itself, so the loader does not request the relaxed-SIMD or legacy builds, which are not in `dist/`.

## Portuguese traineddata

- Package: `@tesseract.js-data/por` 1.0.0
- License: MIT
- File: `dist/ocr/por.traineddata.gz`
- Source tree: `4.0.0_best_int`, the LSTM integer model. The larger legacy bundle is not shipped.
- https://github.com/naptha/tessdata

## `file://`

Opening `dist/lume-pdf.html` as a local file often cannot start the OCR worker: browsers block `new Worker` and `fetch` of the traineddata from `file://`. The text of pages that already have a text layer still loads. OCR runs when the page is opened from the extension (`chrome-extension://…/manual/lume-pdf.html`) or from a local `http://` server, where the worker, the wasm glue and the traineddata are same-origin files. The page says so when it is opened from `file://`.

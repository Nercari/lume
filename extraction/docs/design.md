# Lume extraction: design

Part of #2. This module changes the documents that the #4 reader found into passages with
provenance, and into gap records for all content that it cannot read. The code is in `src/`.
The tests are in `test/`. All tests use synthetic, non-legal technical fixtures.

## 1. Inputs and outputs

- Input: the #4 inventory (`readCase()` output) and a `fetchFile(item)` function that returns
  `{ bytes, contentType }` through the page's own session.
- Output: one result per inventory item: `{ docId, version, pageCount, pages[], gaps[], images[] }`.
- Storage: `persist()` writes the result to the #7 store as `extraction/<docId>@<version>`
  (encrypted, one record per version). OCR page images go to `temp` with a TTL. This module does
  not change `case-store/` or `extension/`. It imports them.

## 2. Passage provenance

Each passage has these fields:

| Field | Meaning |
|---|---|
| `id` | `<docId>@<version>:p<page>:<start>-<end>`. It is also the source reference. |
| `docId`, `version`, `page` | The exact document version and page (1-based). |
| `start`, `end` | Character offsets in the page text (passages joined by `\n`). |
| `region` | `[x, y, width, height]`: PDF units for `pdf-text`, image pixels for OCR. |
| `method` | `pdf-text`, `html-text` or `ocr:<engine id>`. |
| `confidence` | 0..1 for OCR. `null` for native text (no recognition step). |
| `lowConfidence` | `true` when OCR confidence is below the threshold or is absent. |

`openSource(case, passageId)` reads the stored record for that version and returns the page
text, the passage, a link to the original page (`<href>#page=<n>`), and for OCR passages the
retained page image. After the TTL, `imageStatus` is `expired`. The text record stays until the
case is deleted or expires (#7 rules).

## 3. Gaps

A gap is `{ docId, version, page | null, reason, detail }`. `page: null` means the whole
document. Reasons (`GAP_REASONS`): `restricted`, `missing`, `fetch_failed`, `not_read`,
`unsupported_media`, `corrupt_file`, `unreadable_page`, `page_failed`, `ocr_failed`,
`page_count_mismatch`, `extraction_error`, `excluded_from_transmission`.

- Each document has its own `try`. A corrupt or failed document makes a gap for that document
  only.
- A page without a text layer goes to OCR when an engine and a page renderer exist. If not, it is
  an `unreadable_page` gap.
- A file with fewer pages than the inventory says gets one `page_count_mismatch` gap per
  missing page.
- `forTransmission(passages, exclude)` keeps policy-excluded text out of model calls and returns
  a gap for each excluded passage.

## 4. Coverage and quality are separate

`reconcile(inventory, results, measurement?)` returns:

- `silentOmissions`: every inventory item without a result or gap, every expected page without
  text or gap, every result for a version that is not in the inventory, and an incomplete
  inventory. `ok` is `true` only when this list is empty.
- `coverage`: counts of documents and pages with text, with gaps, and with OCR.
- `quality`: OCR passage count, low-confidence count, mean OCR confidence, and
  `recognitionAccuracy`. This value stays `unmeasured` until a CER/WER measurement is given.
  A page with text is covered. That does not mean its text is correct.

`canSupportDecisive(passage)` returns `ok: false` for a low-confidence passage or an OCR passage
without confidence. #6 and #10 must call it before a passage supports a decisive fact.

## 5. OCR error measurement

`measure(excerpts, results)` compares Lume's page text (or an offset range of it) with a
human-checked excerpt `{ docId, version, page, truth, checkedBy }`. It returns CER and WER per
excerpt and micro-averaged totals. Whitespace runs are collapsed. Case and accents count. A page
with no extracted text counts as fully wrong. An excerpt without `checkedBy` is refused.
Today it runs on synthetic fixtures. The real excerpts need the permitted route and manifest from
#3. They stay private. Only aggregate numbers go to GitHub.

## 6. OCR engine: browser first, measure before moving to the companion

The OCR interface is `{ id, recognize({ bytes, mime }) -> { lines: [{ text, confidence, bbox }] } }`.
`createTesseractAdapter(worker)` wraps a tesseract.js worker (WebAssembly, local, in the
extension). The caller creates the worker and loads local language data (`por`), so this package
adds no OCR dependency and no image leaves the device. Tests use a deterministic fake engine.

Measurement plan (needs #3 route and manifest; not run yet):

1. Sample: 30 or more scanned pages from the permitted cases, in three groups: clean, skewed or
   low-resolution, and with stamps or handwriting. Two people check each excerpt.
2. Browser run: tesseract.js `por` in the extension worker on the standard workstation. Record
   per page: wall time, peak memory, CER, WER and the low-confidence share. Render the page at
   200 and 300 DPI.
3. Companion run: the same pages through a native engine in the companion (for example the
   Tesseract CLI), the same metrics, and the native-message transfer time.
4. Move OCR to the companion only if the browser run fails one limit: median more than 10 s per
   page, peak memory more than 1 GB, or CER more than 2 points worse than the companion. Record
   the result on #2 with aggregate numbers only.
5. Set `DEFAULT_THRESHOLD` (now 0.8, uncalibrated) from the same data: the lowest confidence
   where line CER stays under the target the #3 rubric sets.

## 7. Limits

- The page renderer for scanned PDF pages (pdf.js render to canvas) belongs to the extension
  worker. Here it is an injected `renderPage(pdfPage, n)` function.
- HTML documents use tag stripping, not a DOM parser.
- pdf.js runs in Node with the legacy build and without `@napi-rs/canvas` (installed with
  `--omit=optional`). Text extraction does not need the canvas. pdf.js prints canvas warnings.

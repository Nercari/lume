# Evaluation rubric

Part of #3. Schema: `schema/rubric.schema.json`. Scorer: `node src/rubric.mjs <sheet.json> [--aggregate]`.

Score sheets hold real-case results, so they stay in `intake/private/`. Only the
non-identifying summary (opaque case ID, run ID, the six numbers) can go to GitHub, and it
must pass `npm run lint:public`.

## Rules

1. The six dimensions are scored separately, each from 0 to 4. A dimension can also be
   `pending` (not scored yet) or `not-applicable` (for example OCR quality on a case with
   no scans). Factual support cannot be `not-applicable`.
2. The scorer reports each dimension separately. It gives one aggregate number only
   with `--aggregate`, and it refuses when a dimension is missing or `pending`.
3. The aggregate is the lowest scored dimension, not the mean. A useful draft cannot hide
   a factual failure.
4. A run passes only if the aggregate is 3 or more and `invented_decisive_facts` is 0.
5. The human reference annotations (manifest) are complete before a run is scored.
   `found` and `expected` count items against those annotations.

## Dimensions and anchors

| Dimension | Measures | 4 | 3 | 2 | 1 | 0 |
|-----------|----------|---|---|---|---|---|
| `factual_support` | Each stated fact cites a correct document and page. Counts decisive facts found / expected. Records invented decisive facts. | All decisive facts, all cited correctly, ≥95% of other facts supported | All decisive facts; a few minor citation errors | One decisive fact missing or wrongly cited | Several decisive facts missing | Unsupported or invented decisive content |
| `contradictions` | Annotated contradictions found, with both sources. | All, both sides cited | All, one side uncited | Most | Few | None, or a false contradiction stated as fact |
| `gaps` | Annotated gaps (missing documents, unanswered points) found. | All | All but one minor | Most | Few | None, or a gap filled with invented content |
| `method_fidelity` | Draft follows the maintainer's drafting method. **Provisional**: anchors wait for the method package review (issue #3, item 7). | Follows every method rule | One minor deviation | Several deviations | Structure only | Does not follow the method |
| `ocr_quality` | Text from scans is correct and unreadable pages are flagged, not guessed. | No material error; all unreadable pages flagged | Minor errors, no effect on facts | Errors that change one fact | Many errors | Unreadable pages treated as read |
| `draft_usefulness` | The reviewer can use the draft with small edits. | Use with small edits | Moderate edits | Large edits | Only parts usable | Not usable |

Inventory reconciliation (100% of expected documents and pages, issue #14) is a
precondition of `factual_support`: if the inventory does not reconcile, `factual_support`
is at most 2.

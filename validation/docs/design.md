# Validation: real-case quality and subscription use (#14)

## Scope

This package is the report harness for issue #14. It records acceptance denominators,
observed cells, the build version, and a human-review placeholder. It can score a
private-manifest-shaped synthetic set offline. It does not accept that set as a real-case pass.

A real-case Done-when item stays `BLOCKED` until three things are true together: the caller
sets `evidence.flag`, the source is `maintainer-real` on the `#3` permitted route, and an
observed result meets that item's denominator. `runHarness` only accepts `kind: 'synthetic'`
and forces the synthetic guard, so a flag on this runner still cannot mark an item passed.
Missing manifest slices stay `untested`. A stand-in result for a pending slice is ignored.

GitHub gets the aggregate template in `reports/aggregate-template.md` and this design note.
Raw records, party names, case numbers, and credentials stay out of this tree.

## Denominators

Taken from issue #14 and the `#3` manifest rules (`LONG_RECORD_PAGES`, slice ids):

| Check | Bar |
|---|---|
| Set size | At least 5 cases, including a long record of at least 1,000 pages |
| Inventory | 100% of document ids, pages, and statuses; zero silent omissions |
| Decisive facts, contradictions, annotated gaps | 100% detected |
| Other annotated facts | At least 95% |
| Invented decisive facts | 0 |
| Unverified citations labeled verified | 0 |
| OCR rubric and method-fidelity rubric | Unset until agreed before the run |
| Usage | Per-turn latency, quota pause, and resume, with subscription limits stored apart from software price. Paid API fallback is off. The 1,000-page latency cell stays untested here. |

Annotated gaps are the material-gap denominator. The manifest schema has no separate
material flag. Other-fact ids travel beside the manifest because the schema rejects extra fields.

OCR rates come from `#2` `measure` and stay separate from document counts. A rubric score is
not derived from CER/WER. Method fidelity runs the `#8` checks whose dimension is
`method_fidelity` and does not invent a 0–4 score. The private method package is not in this repo.

## What a synthetic run exercises

`scoreCoverage` validates the manifest, compares each annotated inventory row (id, pages,
kind, readable, restricted, added late) with the observation, and, when a case carries a
`#4` inventory plus `#2` results, calls `reconcile`. Pending slices are listed as untested.

`scoreFactual` counts annotation ids. A decisive observation whose id is not in the
annotation is invented. A citation labeled `verified` counts as a false verified label unless
`status` is `verified` and `humanReview` is true. Each case is passed through `#3` `score`
as a pending sheet. Aggregate scoring throws while any dimension is pending, and that
refusal is required.

`measureQuotaPauseResume` opens an in-memory `#7` case, throws the subscription usage-limit
code once, records the `#5` pause, resumes, and completes the same step. `sleep` is a no-op.
There is no HTTP client. `openRoute` accepts only `subscription`.

## Imports

The harness calls leaf interfaces and does not load `extraction/src/extract.js`. That module
loads PDF.js, and so do `#6` `analysis`, `#10` `verify.js`, `#9` `controller.js`, and
`#8` `session.js`. This run does not parse documents or open stored passages.

| Issue | Interface used |
|---|---|
| #3 | `validateManifest`, `score`, `lintText` / `lintJson` |
| #5 | `subscriptionPauseFor` in `usage.js` |
| #4 | `STATES` |
| #2 | `reconcile`, `measure`, `recognize` |
| #7 | `CaseStore`, `pauseReasonFor` |
| #8 | `CHECKS`, `DEFAULT_METHOD` |
| #10 | `leaks` on the aggregate JSON |
| #9 | `AUTOSAVE.measured` (live transfer stays unmeasured) |
| #6 | Not loaded. Inventory reconciliation uses `#2` `reconcile`, which `#6` ingest also calls. |
| #12 | No package on this branch. Pause and resume use `#7` and `#5`. |

`assertPublishable` rejects the report when the `#3` public linter or `#10` `leaks` finds
identifying text. The report stores ids, counts, and statuses. It does not store annotation
sentences.

## Real-case items

Every Done-when line in issue #14 is `BLOCKED`: needs the `#3` permitted route and the
maintainer's real cases. The template repeats that. A green test run means the harness and
the synthetic exercise behaved. It does not mean a real case was validated.

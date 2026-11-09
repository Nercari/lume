# Aggregate validation report (template)

Part of #14. Fill this from a permitted maintainer run. Until then every acceptance row
stays BLOCKED. Do not paste raw records, party names, case numbers, or credentials here.

Synthetic exercise output is not an acceptance result. A missing slice stays untested.

## Build

- component: `lume-validation`
- version: `{{build.version}}`
- node: `{{build.node}}`

## Human review

- method: `{{humanReview.method}}`
- reviewer: `{{humanReview.reviewer}}`
- protocol: `{{humanReview.protocol}}`
- completed before evaluation: `{{humanReview.completedBeforeEvaluation}}`
- rubric agreed before the run: `{{humanReview.rubricAgreed}}`

Leave these empty until the maintainer records them. Do not invent a method.

## Denominators

| Check | Denominator | Observed on real cases |
|---|---|---|
| Cases | at least 5, including a long record of at least 1000 pages | `{{observed.cases}}` |
| Document ids, pages, statuses | 100% | `{{observed.inventory}}` |
| Silent omissions | 0 | `{{observed.silentOmissions}}` |
| Decisive facts, contradictions, annotated gaps | 100% | `{{observed.decisive}}` |
| Other annotated facts | at least 95% | `{{observed.otherFacts}}` |
| Invented decisive facts | 0 | `{{observed.inventedDecisiveFacts}}` |
| Unverified citations labeled verified | 0 | `{{observed.falseVerified}}` |
| OCR rubric | agreed before the run | `{{observed.ocr}}` |
| Method fidelity | agreed before the run | `{{observed.method}}` |
| Usage | pause, resume, latency; subscription limit apart from software price; no paid API | `{{observed.usage}}` |

## Acceptance

| Id | Status | Reason |
|---|---|---|
| report-fields | BLOCKED | needs #3 permitted route and the maintainer's real cases |
| coverage-factual | BLOCKED | needs #3 permitted route and the maintainer's real cases |
| ocr-method | BLOCKED | needs #3 permitted route and the maintainer's real cases |
| usage-range | BLOCKED | needs #3 permitted route and the maintainer's real cases |
| failures-public | BLOCKED | needs #3 permitted route and the maintainer's real cases |

## Missing slices

| Slice | Status |
|---|---|
| `{{slice}}` | untested |

No synthetic case may replace a row above.

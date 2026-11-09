# Analysis: coverage ledger, findings and the provisional-draft gate (#6)

## Scope

This module reads the whole readable case. It records what was analyzed, classifies each
assertion, and shows the material gaps. It does not rank or skip portions by relevance.

## Ledger shape

The ledger is one JSON object per case (`emptyLedger()` in `src/ledger.js`):

| Field | Content |
|---|---|
| `rev` | Counter. Each `ingest` call adds 1. |
| `inventory` | `{status, fingerprint, items, rev}`. The fingerprint is a hash of `id@version:state` for all items. |
| `portions` | Key `<docId>@<version>:p<page>`. One readable, permitted page. Fields: `hash`, `passageIds`, `method`, `lowConfidence`, `status` (`pending` or `analyzed`), `call` (`{stepId, at, attempts}`). |
| `passages` | The #2 passages that the transmission policy permits, by passage id. |
| `findings` | Classified assertions (see below). |
| `gaps` | Extraction gaps and finding gaps, each with `impact`, `reclassification` and `history`. |
| `drafts` | `{findingIds, stale}` per draft id. |
| `log` | One event per `ingest`: `changed`, `added`, `staleFindings`, `staleDrafts`, `inventoryChanged`, `reconcileOk`. |

`coverage()` is the evidence check. A portion counts as analyzed only when the #7 store holds a
call record with `status: 'done'` for its step. A ledger entry alone is not evidence.

## Findings

Each assertion has one class: `fact`, `allegation`, `contradiction`, `unknown` or
`legal_conclusion`. An invalid class becomes `unknown` and gets an issue.

- A cited passage must be in the input of that call. If not, it is rejected (`not_in_call_input`).
- For a decisive assertion, each cited passage must pass #2 `canSupportDecisive`. A
  low-confidence OCR passage is rejected (`low_confidence`). It stays visible in `rejected`.
- Every decisive assertion needs admissible support, whatever its class. A fact, an
  allegation, an unknown, or a legal conclusion needs one admissible passage. A
  contradiction needs two. With fewer, `supported` is false and the issue is
  `no admissible source for a decisive assertion` (or
  `contradiction needs two admissible sources`). The finding stays visible. A
  non-decisive assertion is not held to this check.
- Support is inspectable: a passage id is `<docId>@<version>:p<page>:<start>-<end>`.
- Two current facts or allegations on the same `subject` with different `value`s make an automatic
  contradiction `contra:<subject>`. All sides are listed. A side with only rejected support
  still shows, and the contradiction is then unsupported.

## Invalidation rules

`ingest()` runs for the first build and for each change: a late attachment, a new version, a
new scan or OCR run.

1. A portion is changed when it is gone or its hash is different. An unchanged portion keeps
   its status and call.
2. A finding that refers to a changed portion becomes stale (`source changed`).
3. When the inventory fingerprint changes, `unknown` and `legal_conclusion` findings become
   stale (`inventory changed`). These depend on the whole record.
4. A draft becomes stale when it uses a stale finding, when the inventory changed, or when new
   material is not analyzed yet.
5. A human reclassification that cites a changed or removed passage is revoked. The gap goes
   back to `unknown`. The record stays in `history`.

Stale findings stay listed. The next `analyze()` call analyzes only the pending portions.

## Provisional-draft gate

A gap with impact `unknown` (the default) or `indispensable` blocks. Finding gaps are
`unsupported_decisive:<id>` and `decisive_unknown:<id>`. A decisive assertion with no
admissible cited passage, including a legal conclusion, is `supported: false` and opens
`unsupported_decisive:<id>`. It does not count as supported. A decisive `unknown` that
does have admissible support still opens `decisive_unknown:<id>`.

`draftState()` returns `stale`, `provisional` or `conclusive`. `editable` is always `true`:
analysis and editing continue. `assertConclusive()` throws `ProvisionalDraftError` unless the
state is `conclusive`. Use it before presentation or transfer as a ready conclusive draft.

`reclassifyGap()` is the human gate:

- Any actor can set `indispensable`.
- Only `actor: 'human'` can set `dispensable`. The call needs `by`, a `reason`, and one or more
  current source passages. The record keeps the reason, the sources (passage and portion) and
  the time.
- The model gets no tool for this call. The panel's user-action handler sets `actor`.
- There is no "dismiss warning" function.

## Interfaces consumed

| Module | Use |
|---|---|
| #2 `extraction` | `extractCase` results (pages, passages, gaps), `reconcile` (silent omissions become gaps), `forTransmission` (excluded text becomes a gap), `canSupportDecisive`, `parseRef`. |
| #7 `case-store` | `runStep` sends each call once and stores the call record (coverage evidence). `get('call', …)`. The ledger is a `checkpoint` record (`save`/`load`). Drafts and edits use `saveUserEdit` and `getDraft`. |
| #3 `intake` | No code dependency. `summary()` lists all findings by class with no cut-off, for the rubric dimensions `factual_support`, `contradictions` and `gaps`. |
| #4 `extension` | The inventory shape `{status, items: [{id, version, kind, parentId, state, expectedPages}]}`. |

## Limits

- One page is one portion. One analysis call runs per document version.
- The hash is FNV-1a for change detection only. It is not a security control.
- Automatic contradictions need the model to give `subject` and `value`.

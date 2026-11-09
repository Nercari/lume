# Lume batch queue: design

Part of #11. This package is the offline queue and isolation core. It runs on synthetic
fixtures only. A permitted real-case batch is **blocked** until #14 and #13 pass their
single-case gates and #3 has an approved batch access and data scope.

The code is in `src/`. The tests are in `test/`. No test uses a network, a model, or a
case record.

## 1. What is blocked

The issue's real-batch check is not claimed here:

- There is no permitted real-case batch, so preview equality and distinct results are
  proven only on fixture ids such as `fixture-alpha`.
- Label and natural-language selection are deterministic stubs over `labels` and
  `keywords` on that catalog. They do not call a model and they do not read case text.
- Authenticated reads are represented by `browserSession()`. The queue does not open a
  browser and it does not touch PJe.
- The transfer gate does not sign, file, publish, or insert. A live editor recheck
  stays with #9, on a permitted case, after the user takes the one-case handoff.

## 2. Selection preview

The queue holds at most `MAX_BATCH` cases (5). Three selectors return a frozen preview.
None of them returns `confirmed`.

| Mode | Input | Included list |
|---|---|---|
| `manual` | Explicit ids, in that order | Those ids, or an error if one is unknown, repeated, or over the limit |
| `label` | Every requested label must be present | Matching catalog rows, in catalog order |
| `natural_language` | Exact tokens against labels and keywords | Same shape as label selection |

`included` is the visible list of cases that confirmation can run. `caseIds` is that
same list. If a label or natural-language match is larger than the limit, the status is
`needs_narrowing`: every match stays in `candidates`, and `included` is empty. Nothing
is dropped silently.

`confirmSelection` accepts only ids that are already candidates. A subset is allowed
(the user unchecked a row). An id that was not in the candidate list throws
`unconfirmed_case`. `BatchQueue.load` rejects a selection that is not `confirmed`.

## 3. One task authorization

`createAuthorizer` records the provider, the data scope, and the set of case ids.
The same material scope returns the same authorization and does not prompt again,
including when the ids are listed in a different order. A change of provider, data
scope, or case set throws `renew_required` unless the caller passes `renew: true`.

The queue stores that one authorization. The runner sees the same `authId` on every
case. The queue does not authorize per document or per turn. Each case gets its own
permissions object (`{ caseId, data }`) so one case cannot replace another's scope.

## 4. Isolated queue

`load` builds one slot per confirmed case: status, attempts, error code, draft, draft
id, evidence, and permissions. The runner receives only `{ caseId, attempt,
idempotencyKey, authId }`. It does not receive another case's draft or evidence.

A result is stored only when `result.caseId` is that slot. Evidence that names another
case is `case_mixing` and fails that slot only. `report(caseId)` returns a copy.
`progress()` lists ids, statuses, attempt counts, and error codes. It does not include
draft text.

An ordinary failure (`retryable: false`, or a retryable error that has used
`maxAttempts`) marks that case `failed`. Later cases still run. The default bound is
3 attempts. A case that already succeeded is not run again: its idempotency key stays
in `seen`, and resume skips a `succeeded` slot.

These shared conditions pause the whole queue before the next case starts:

- `auth_expired` (also HTTP 401)
- `quota_exhausted` (also HTTP 429)
- `pje_session_unavailable` when `browserSession()` is not true, or when the runner throws that code

A shared pause does not consume the attempt and does not mark the case failed.
`resume()` runs only when the shared condition is clear. If it is still set, the queue
stays paused and no runner is called.

`cancel()` during a run keeps the in-flight result if that attempt returns one, and
marks cases that have not started as `cancelled`. It does not abort the in-flight
attempt. `resume()` puts those cancelled cases back to `pending` and does not repeat a
succeeded case.

Drafts stored on a slot are short synthetic strings (at most 200 characters). This core
is not a case archive.

## 5. Comparison context

`compare(question, caseIds)` builds a frozen `{ kind: 'comparison', question, citations }`
value and appends it to `comparisons`. Each citation is `{ caseId, sourceId, locator }`
taken from that case's own evidence. A source whose `caseId` does not match the case
being cited throws `foreign_source`. A case that did not succeed throws `not_ready`.

The context has no draft field. Any options argument throws
`comparisons_do_not_change_drafts` before a context is stored. The method reads drafts
only to check that they still point at the same strings afterwards.

## 6. Individual transfer

`TransferGate` imports the #8 `USER_ACTION` symbol, the same symbol #9 requires.
`review(caseId, origin, editor)` and `handoff(caseId, origin, editor)` each require
that symbol. Strings, plain objects, and a different symbol are refused with
`GateError`. An array of case ids is refused. `transferMany`, `sign`, `file`,
`publish`, and `insert` always throw. A fourth `handoff` argument (a write command,
including a #9 insert mode) throws.

`review` checks that this case succeeded and that `editor.caseNumber()` is this case.
It stores `{ caseId, draftId, editorId }` and writes nothing. `handoff` checks the
symbol again, then checks the case number and the editor id against that ticket.
The result is `individual_handoff` with `effect: 'none'`. A repeat for the same case
is `already_handed_off` and still does not write. The UI can take that one-case
handoff to the #9 controller. This package does not call it.

Importing the symbol loads the chat-editor session module, which loads analysis and
extraction. Extraction imports `pdfjs-dist`, so a build or test needs `npm ci` in
`extraction/` first. This package has no npm dependencies of its own.

## 7. Assumptions

- The small-batch cap is 5 cases and the retry cap is 3 attempts.
- Shared pause codes match the #7 case store (`auth_expired`, `quota_exhausted`,
  `pje_session_unavailable`).
- Natural-language selection is an exact token stub, not a model.
- Cancel keeps a finished in-flight result instead of trying to roll it back.
- The batch handoff is not an editor write. Insertion stays individual, in #9, and
  only after a separate user action there.

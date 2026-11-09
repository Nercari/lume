# Transfer controller (#9): design

The controller moves one reviewed draft into the PJe minuta editor. Only the user can start it. It never saves, signs, files or publishes.

## Flow

1. `review(draftId, USER_ACTION)` runs the #8 conclusive-presentation gate, the #10 source-panel check and the editor check. It writes nothing to the editor. It stores a ticket in the case checkpoint `transfer.<token>`. The ticket holds the draft text, the ledger revision, the editor id and the editor text before the transfer (`before`).
2. The UI shows the modes, the previews and the autosave effects (`AUTOSAVE`). The user selects one mode.
3. `transfer(token, mode, USER_ACTION)` runs all checks again. Then it writes the editor one time.

## Modes

| Editor before | Modes offered | Result |
|---|---|---|
| empty | `empty` | draft |
| has text | `replace`, `append` | `replace`: draft. `append`: old text, `\n\n`, draft |

The controller does not offer `empty` when the editor has text. Thus it cannot overwrite manual text without a user choice. After `replace`, the ticket keeps the old text in `before` for recovery.

## Stop conditions (`TransferStop.reason`)

- `case_changed`: the open PJe case number is different, or the case record (ledger `rev`) changed after review.
- `draft_changed`: the draft text changed after review. Do a new review.
- `editor_changed`: another editor is open, or the editor text changed after review.
- `unsupported_decisive`: a decisive #10 entry does not have the status `verified`, or #10 has unaccounted entries, or #8 marks a citation as not unverified. An entry without a `decisive` flag counts as decisive.
- `no_source_panel`: no #10 panel is available.
- `source_panel_failed`: the #10 panel check threw an error (for example, a passage without `method`). The controller treats this as unverified and writes nothing. The error text is not kept.
- `ProvisionalDraftError` / `GateError` from #8: the draft is provisional, or the gate fails.
- `mode_not_offered`, `mode_changed`, `unknown_ticket`, `transfer_in_progress`.
- `uncertain_editor_state`: see below.
- `autosave_unmeasured`: a live editor while `AUTOSAVE.measured` is false.

## Interruption and idempotency

The ticket token is the insert token. Before the write, the controller persists `state: 'writing'` and the expected `after` text. After the write, it reads the editor again and sets `state: 'done'`.

On a retry with the same token:

- `done`: return `already_done`. No write.
- `writing` and the editor shows `after`: the write completed before the interruption. Set `done` with no second write (`verified_after_interruption`).
- `writing` and the editor shows `before`: the write did not occur. Write one time.
- `writing` and the editor shows other text: set `uncertain` and stop. The controller never retries in this state. The user must examine the editor; `before` stays in the ticket.

An in-memory lock stops a second transfer while one runs. Thus a double click does not write two times. Result: no duplicate text and no lost manual text.

## Autosave

`AUTOSAVE.measured` is `false`. Nobody has measured PJe autosave on a real workstation. The assumption: PJe can autosave the minuta after an editor change. Therefore a transfer can become a saved minuta without a separate click. The review and the transfer results return `AUTOSAVE`, so the UI shows this before the user selects. The controller only writes the editor text, one time per ticket. It never saves, signs, files or publishes. Until a maintainer measures autosave on a permitted case and sets `measured: true`, the controller refuses all editors that are not `kind: 'mock'`.

## Human-only boundary

- `review` and `transfer` require the #8 `USER_ACTION` symbol. Only UI code has it. Model output, page DOM and JSON cannot carry a symbol, so the strings `'USER_ACTION'`, `'human'`, other symbols and `{actor, command}` objects are refused with `GateError`.
- All arguments must be plain strings. A token from page content is not a known ticket.
- The controller and the editor adapter have no sign, file, publish, save or submit method. Draft text with instructions is data; the controller writes it as text and does not run it.

## Diagnostics

Errors from the controller do not carry case ids, PJe case numbers, document ids, finding ids or caller strings:

- `TransferStop` details are fixed text or counts. `unsupported_decisive` gives `{ entries, unaccounted, sections }`. A section name that is not a plain section key becomes `other`. `mode_not_offered` does not repeat the mode.
- #8 `ProvisionalDraftError` and `GateError` carry the draft view. The controller throws a new copy with only the state and the check names. The UI gets the details from `session.view()`, which stays local.
- Tickets keep the draft and editor text in the local case store only. Tickets are not diagnostics.
- Party names never go into a diagnostic. The controller does not copy the panel `ref`, the error text of a failed panel check, or any research data into an error.

The #10 research query sanitizer (`source-panel/src/research.js`) is outside this module. It removes the case id and a non-CNJ case number only when the caller passes them in `caseTerms`.

## Assumptions

- The editor selectors in `EDITOR_PROFILE` are not verified on real PJe.
- A decisive entry must have the #10 status `verified`. #10 gives `verified` only after a human review records `supports` for each citation. Every other status blocks, `unverified` included. Non-decisive entries do not block.
- The controller does not use the legal-source `currency` field. #10 `currencyOf` can return `current` for a date that is not valid or is in the future, so `current` is not proof that a source is fresh.
- The controller does no quote check of its own. A multi-passage `quote_mismatch` can be a false positive in #10; it blocks only because it is not `verified`.
- The editor content is plain text (`textContent`). Rich-text format is out of scope.

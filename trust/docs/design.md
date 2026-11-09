# Trust boundaries and interruption safety

Part of #12. This package drives the packages already on `main` (#5, #4, #2, #7, #6, #8, #10, #9). It does not replace them. Fixtures are synthetic. The harness does not open PJe, sign in, or call a model.

## Boundaries

Policy, destinations, permissions, and case identity are fixed outside evidence text.

| Boundary | Owner | What evidence cannot do |
| --- | --- | --- |
| Permissions | `extension/manifest.json` (`sidePanel` only) | Add a permission or a content-script match |
| Destinations | Empty model destination list. The controller destination is the PJe editor text | POST or redirect a draft |
| Extension surface | Fixed manifest permissions and content-script matches | Extra permissions or cross-origin fetches from evidence |
| Case identity | The case element the extension parses, and the case id the transfer controller was given | A sentence in a row, or a second list page for another case |
| Writes | `TransferController.review` / `transfer`, `CaseSession.decideGap`, `recordReview` | Run without the `USER_ACTION` symbol. A string, a lookalike symbol, or an `actor` field is refused |
| Model tools | Read names in `trust/src/policy.js` | Insert, grant, sign, or send |

`absorb` keeps evidence as a byte count. The policy object is frozen. The tool surface calls case-store and research reads only. Write names return `controller_only` or `unknown_tool` and do not call the controller.

## Matrices

`runSecurityMatrix` records one row per prompt-injection attempt (document text, page DOM, research text, model JSON). A row is refused when the real API rejects it and the four counters stay at zero: destinations, actions, permission changes, case-target changes.

`runFailureMatrix` records interruptions across the case-store step runner, the extension reader, chat-editor regeneration, and the transfer controller. The mock editor, in-memory backend, and injected model stand in for the worker, the browser, the network, auth, and quota. Each row measures mixed cases, duplicate insertions, and lost manual edits. A partial editor write is uncertain: the pre-write text stays on the ticket and a later click does not write again.

`runStorageChecks` uses the AES-GCM codec, case delete and expire, namespace rules, and `TokenCustody` with an in-memory vault. Diagnostics and logs are checked for synthetic token strings.

## Report

`npm test` writes `trust/reports/matrix.json`. The file has the package version, the Node runtime, the repo-relative paths the harness imported, the three result counts, and the blocked limits. It has no case text and no token values.

`docs/results-template.md` is the empty sheet for a later live run. Do not put case identifiers or account details on it.

## Limits

Live PJe, a real ChatGPT account, an OS credential vault, and a Chrome Native Messaging process are not available here. Those rows are `BLOCKED` in the report. `AUTOSAVE.measured` in the transfer package stays false, so this harness does not claim a live insert.

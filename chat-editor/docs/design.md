# Case chat and side editor (#8)

## Method abstraction

A drafting method is one object: `{ id, docTypes, instructions, checks }` (`src/method.js`).

- `docTypes` gives the section structure of each document type. The default method has `sentenca`, `decisao` and `despacho`, with the generic public structure (report, reasoning, order).
- `instructions` is the only text that goes to the model as the method.
- `checks` are deterministic functions. They run on the model output after each generation. They are not in the prompt. Each check names one #3 rubric dimension (`intake/src/rubric.mjs`). An import-time assertion stops a check with an unknown dimension.

A different method replaces this object. The rest of the code does not change.

Document type: `inferDocType` infers the type from keywords in the request and records `basis: 'inferred'` and the reason. The view shows it. `setDocType` changes it (`basis: 'user'`), and the next regeneration uses it.

Outcome: without a requested outcome, the model must propose a conclusion with reasoning (check `conclusion_reasoned`). With a requested outcome `{ text, premises: [{ subject, value }] }`, `incompatibilities` lists each contradiction and each finding that contradicts a premise. The evidence keeps these findings. The draft must address each one (check `contrary_addressed`). The view keeps the flags.

## Case context and style

`buildContext(ledger)` makes one frozen context from the #6 ledger: non-stale findings, open gaps and #2 passages. Chat and drafting use the same object. The ledger revision is the cache key.

Personal instructions and example drafts go in a separate `style` field, marked "style and structure only; not case evidence". They never go in `evidence`. The check `no_style_facts` flags a number or name that is in the draft and in the style material but not in the case. This check is lexical (a known limit; see the `shortcut:` comment).

A correction has scope `draft` by default. It changes only the regenerations of that draft. Scope `future` changes the session profile and returns it, and the caller stores it. Nothing else changes the profile.

## Clean text and sources

The draft text has no citations. The code moves citation markers out of the model output into the source panel (`sourcePanel`). Each panel entry links a section to findings and passages, with `verification: 'unverified'`. #10 replaces this stub.

## Edit preservation

#7 keeps generated revisions apart from the user's edit (`addGeneratedRevision`, `saveUserEdit`). When a regeneration meets a user edit, `merge3` does a three-way merge per `## ` section: base (the revision the edit is based on), user, generated. If only one side changed a section, that side wins. If both sides changed it, the section is a conflict. The user edit stays the current text, and the view shows each conflict section with base, user and generated text. If the heading structure changed, the whole text is one conflict. `resolveConflict` accepts `keep-user`, `take-generated` or a merged text.

## Gate

Each generation registers the used findings with #6 `registerDraft`. `view` combines the #6 `draftState` with failed checks and open conflicts. `presentConclusive` is the only path that presents a draft as ready, and #9 transfer must call it. It throws `ProvisionalDraftError` while the #6 gate is closed, a check fails, or a conflict is open. Editing continues in all states.

## Trust boundaries (follow-up from the #6 review)

Gap decisions: `decideGap(gapId, decision, origin)` is the only path from this module to #6 `reclassifyGap`. It accepts only the `USER_ACTION` symbol as origin. Only the UI user-action handler holds this symbol. Model output and page content are data (JSON, DOM text), so they cannot carry a Symbol. The session sets `actor: 'human'`. A decision that contains an `actor` field is refused. The code does not read model output for gap decisions.

Decisive support: #6 requires a citation for a decisive fact, allegation or contradiction, but not for a decisive legal conclusion or unknown. This module requires it for all classes. A decisive finding is `inspectable` only if #6 marks it supported and it cites at least one current #2 passage (two for a contradiction). The check `facts_from_case_only` flags a section or conclusion that uses a decisive finding that is not inspectable, so the draft stays provisional. The source panel marks the entry `unsupported`.

## Use of #3, #6 and #7

- #3: rubric dimensions for the checks. Human rubric scoring on a real case is not done here.
- #6: ledger, findings, gaps, `reclassifyGap` (through `decideGap` only), `registerDraft`, `draftState`, `assertConclusive`.
- #7: `runStep` (idempotent model calls), conversation messages, checkpoints for draft metadata, and draft revisions with conflicts.

The model is an injected function. Tests use a deterministic fake. This module makes no network call.

Private reference examples are not in this module: code, prompts, fixtures and docs use only synthetic technical content.

# VERIFY

This file is the merge evidence for this repo. Update it in the same PR when behavior changes.

## Commands

- Test one package: `npm test --prefix <package>` (packages: intake, chatgpt, extension, case-store, extraction, analysis, chat-editor, source-panel, transfer, packaging, trust, validation). Packages that import `extraction` need `npm ci --omit=optional --prefix extraction` first.
- Hosted CI runs the same package tests in the per-package workflows under `.github/workflows/`.

## Essential check

GREEN for a merge: `hq_onboard_repo.py merge N --repo Nercari/lume` runs these commands on main with the PR head merged in and posts `verify/essential`. They are offline, finish in seconds, and need no installed dependencies. The unit tests run in each PR's own PROOF CMD and in hosted CI, not here.

```
npm run build --prefix intake
npm run lint:public --prefix intake
npm test --prefix chatgpt
npm run build --prefix case-store
npm run build --prefix extension
```

Plugin packages: `node --test plugins/test/*.test.mjs` (also run by `plugins.yml`). It covers `plugins/lume-workspace` (manifests, skills, scrub, `lume_check.py` through `python3 -I`) next to `lume-jef`. `extract_pdf.py` needs `pypdf` and is not run by the tests.

## Synthetic one-click eval

The one-click eval scores capture, state and OCR accuracy on three generated cases. It needs the Playwright Chromium that `npm test` uses, stays on localhost, and is not a CI gate.

```
cd extension && npm ci && npm run build && npm run eval:synthetic
```

`npm run eval:synthetic -- --runs N --latency MS` changes the run count (default 3) and the simulated PJe latency (default 150 ms). The command prints one JSON line: `documentsCaptured` over `documentsExpected`, `captureRate`, `stateMatches` over `stateExpected`, `stateMismatches` by synthetic id, `sigiloWarningShown`, `ocr.cer` and `ocr.wer` over `ocr.pages`, the median `totalSec` and `latencyMs`. Capture and OCR come from the first run; a mismatch seen in any run is listed; the time is the median over the case runs. It carries no document text. Paste the line in the PR.

## Document fetch waves (ready time)

`collectCase` fetches a case in waves of at most `DOCUMENT_FETCH_LIMIT` (4) documents. The pause from the panel (`DOCUMENT_PAUSE_MS`, "pausa entre documentos") now runs between waves, not between every document; `lumePauseMs: 0` still removes it. A wave resolves before its documents are classified and delivered, in list order, so the pack order, the per-document states and the sigilo, restricted and corrupt handling are unchanged.

Measured on 2026-11-11 with the synthetic eval above (3 cases, 27 documents, 3 runs, median):

```
before, 150 ms: {"latencyMs":150,"totalSec":4.38,"captureRate":1,"stateMatches":27,"ocr":{"pages":9,"cer":0,"wer":0}}
after,  150 ms: {"latencyMs":150,"totalSec":1.88,"captureRate":1,"stateMatches":27,"ocr":{"pages":9,"cer":0,"wer":0}}
before, 0 ms:   {"latencyMs":0,"totalSec":3.39,"captureRate":1,"stateMatches":27,"ocr":{"pages":9,"cer":0,"wer":0}}
after,  0 ms:   {"latencyMs":0,"totalSec":1.38,"captureRate":1,"stateMatches":27,"ocr":{"pages":9,"cer":0,"wer":0}}
```

`npm test --prefix extension` covers the wave cap, the order, the abort and one failed fetch kept to its own document.

## Research query identity (case id and case number)

`research()` requires the case id and the open case number, CNJ or not. It refuses with `QueryLeakError` when either is absent, so no caller can send a query without them. `caseTermsOf(L, { caseId, caseNumber, extra })` includes both, so a non-CNJ number is removed like a CNJ one, also inside punctuation and in any case.

Synthetic repro from #25 (no network, no real case material; `transfer/test/fixtures.js` `setup()`):

```
before: {"query":"tema do processo fixture-alpha e synth-0001","removed":[]}
after:  {"query":"tema do processo e","removed":["case_term"],"caseIdPresent":false,"caseNumberPresent":false,"queriesSent":0}
```

`npm test --prefix source-panel` covers the sent query and the diagnostic log with neither value, the refusal when either is missing, and the non-CNJ number.

## lume-claude (Lume plugin for Claude Chat)

Target: Claude Chat (claude.ai web and the Chat tab in Claude Desktop). Cowork and Code are separate surfaces. A result on one surface does not stand in for another. Run ID `lume-claude-20261113T185757Z-fd8b0c59`. The tree is built from `plugins/lume-workspace` by `node plugins/scripts/build-lume-claude.mjs`; `--check` fails when the committed tree differs.

```
cd plugins && node --test test/*.test.mjs        -> tests 35, pass 35, fail 0, skipped 0
node plugins/scripts/build-lume-claude.mjs --check -> PASS: 161 files match
node plugins/test/scrub.mjs                       -> PASS: no matches under plugins/
sha256sum -c lume-claude-chat.zip.sha256          -> lume-claude-chat.zip: OK (161 entries, 4b47bb5a…2f74)
```

| Surface | Evidence | Status |
|---|---|---|
| Chat | Official upload rules read; every skill folder is self-contained (SKILL.md-relative paths, no `${CLAUDE_*}`, no `bin/`); folder-only sandbox simulation | Live upload, activation and 3 workflows: **NOT RUN**. Blocker: no authorized live Chat session; the agent does not sign in to a user account. This is an unverified acceptance item; it does not block the tests or the artifact. User-side steps: `chat/CHAT-TEST-STEPS.md` in the run directory. |
| Cowork | Official page read only | **NOT RUN** |
| Code | `claude plugin validate --strict`, isolated install (12 skills, 1.2.0), 35 tests, Haiku smoke | Executed. Does not prove Chat. |

Port vs improvement (kept apart; `lume-workspace` is unchanged): of 161 shipped files, 25 are port-identical, 11 are edited, 123 are byte copies of shared modules into the skill folders that cite them, and 2 are Chat wrapper files. PORT tests compare with the source; `IMPROVEMENT (Chat)` tests check the declared edits. Defaults in force: version 1.2.0 (manifests agree; a test pins it), 12 skills kept, history unchanged. LICENSE holder legal acceptance stays with Themis and Pedro; the agent changes no holder text. Nothing here waits on an answer.

Untested in Chat (undocumented): loading a skill by name, the `lume:` namespace, pypdf/OCR/network in the sandbox, profile persistence. Record: `audits/moonshots/lume-claude-chat-2026-11-13.md`. Council: 4 seats ran (m1, m2, m3, m5); only m1 has a verified executed model; m4 was refused by the paid-model allowlist. A verified fourth participant is **NOT MET**. Chat workflows: **NOT RUN**. See the Acceptance addendum in the record.

## Voto timing harness (synthetic proxy, `audits/hillclimb/voto-timing/`)

Measurements from the two haiku smoke runs are **UNCONFIRMED pending repair**: the evaluator accepted a dispositive found only in the ementa and did not reject partial, absent or conflicting outcomes (PR #62 finding). The repaired check classifies each numbered paragraph, needs a dispositive of the oriented class, and rejects ambiguous, mixed or ementa-conflicting outcomes. No timing counts as T. No climb is initialized, so lock and relock do not apply. No new model run was made.

```
node --test audits/hillclimb/voto-timing/harness.test.mjs -> tests 12, pass 12, fail 0 (old evaluator with the same 12 tests: pass 9, fail 3)
node --test audits/hillclimb/voto-timing/harness.test.mjs -> tests 14, pass 14, fail 0 (head 5033c25 evaluator with the same 14 tests: pass 12, fail 2)
```

Second repair: a precedent's denial that is quoted or attributed in the reasoning is not this voto's dispositive. The check drops quoted spans and attribution sentences, then classifies each paragraph. Earlier missing-dispositive and contradictory-partial cases stay rejected; legitimate decisions stay accepted. Keyword limit: an own decision phrased with an attributed verb is a false reject, never a false accept. All usable-voto timing stays **UNCONFIRMED**; an independent evaluator approval is required before any climb.

Measurement gates (`audits/hillclimb/voto-timing/gates.json`): independent evaluator, Law vetoes, held-out isolation and case readiness are all **UNMET**. A live run stops before any model call until each is VERIFIED by its owner with a GitHub link. The harness now also times model revisions into the total and labels timing `SYNTHETIC_PROXY`; upload and human review stay UNMEASURED. `node --test audits/hillclimb/voto-timing/harness.test.mjs` -> tests 17, pass 17, fail 0.

Third repair (independent review rv-integrate-pedro-plugin-a14f-6206 FAIL at 58674067): a bare infinitive ("No precedente da Turma, deve-se negar provimento ao recurso.") and a negated denial ("Não nego provimento ao recurso.") were accepted as the dispositive. The check now has two views. The operative view counts only decision forms (first person, participle, noun phrase, "voto por/no sentido de ...") and drops negated and "No precedente/julgado/acórdão" sentences. The loose view still sees infinitives, and flags a negated denial as INVERTIDO, so a contradiction cannot hide. Synthetic regressions: 20/20 tests pass; the new tests fail at 58674067. Known limit: an own decision phrased as an infinitive or opening with "No precedente" is a false reject, never a false accept. All four gates stay UNMET. The independent evaluator is not yet re-run at the repaired head.

Fourth repair (Cipher, Codex discussion_r4569573493 at 5c12864): attribution filters at clause scope, so an own first-person clause in an attributed sentence still counts. Exact pair: baseline own denial plus "**5.** Diante do que decidiu a Turma no paradigma, dou parcial provimento ao recurso." returned [] at 5c12864 and now fails; the same grant without attribution fails as before. Synthetic input only, no generation, gates unchanged (all four UNMET), smoke timings UNCONFIRMED, no baseline or timing gain claimed.

Fifth repair (independent review run2 FAIL at affad4e2): a passive without a named source is not attribution. Exact pair: baseline own denial plus "**5.** Assim, foi dado provimento parcial ao recurso." returned [] at affad4e2 and now fails. Synthetic input only, no generation, gates unchanged (all four UNMET), smoke timings UNCONFIRMED, no baseline or timing gain claimed.

Sixth repair (independent review run3 at 364bd546, scoped PASS for the bare-passive repair only): two false accepts fixed. (A) A plural participle ("Foram providos os embargos.") now counts as PROVIMENTO. (B) A source mention inside an introductory phrase ("Nos termos do voto do relator na Turma, foi dado provimento parcial ao recurso.") no longer hides an own passive decision, because the source must now introduce the passive in the same sentence start. In a sentence marked as attributed, a passive clause after the first outcome clause counts as own. Synthetic input only, no generation, gates unchanged (all four UNMET), smoke timings UNCONFIRMED, no baseline or timing gain claimed. Law owns veto approval.

Seventh repair (independent review run4 at 71489c2f, scoped to the run3 fixes): a ground phrase or the decision under review is not a source. Exact case: baseline own denial plus "**5.** Em razão do acórdão recorrido, foi dado provimento ao recurso." returned [] at 71489c2f and now fails. A source phrase that opens with a ground word (razão, força, termos, face, vista, virtude, acordo, conformidade, decorrência, consequência, função, relação, atenção, aplicação), or that names the decision under review (recorrido, embargado, impugnado, agravado, combatido), is no longer attribution. Synthetic input only, no generation, gates unchanged (all four UNMET), smoke timings UNCONFIRMED, no baseline or timing gain claimed. Law owns veto approval.

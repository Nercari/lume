# Synthetic voto timing harness

**SYNTHETIC PROXY. Not a real baseline. Not an improvement claim.** Part of the hillclimb baseline card (`../lume-voto-time-edits-2026-11-13.md`). No climb is started. No private or held-out data is used: the case in `fixture/` is invented.

## What it measures

Four segments, each with a monotonic clock: `t_pack` (local pack build plus the plugin's `lume_check.py package`), `t_relatorio` (model), `t_voto` (model), `t_verify` (local structural checks). `totalSec` is set only when the voto passes the checks. Otherwise it is `null` and only `elapsedSec` is reported.

Elapsed time and edit burden stay apart. `editBurden` is always `UNMEASURED`: it needs Law's paired human edits.

The checks are structural proxies, **not Law's vetoes**: required facts, `[doc-NN]` locators exist, «quotes» are literal in the docs, dates and amounts occur in the docs, the relatório does not decide, numbered paragraphs, ementa, no headings, lists or semicolons, and the dispositive itself matches the oriented outcome. The check classifies each numbered paragraph (DESPROVIMENTO, PARCIAL, PROVIMENTO, NAO_CONHECIMENTO). It needs at least one paragraph with an outcome, and every outcome in the body must equal the oriented class, so an absent, ambiguous or mixed dispositive fails. An ementa outcome that differs from it fails. The ementa never satisfies the check by itself. A keyword limit remains: a reasoning sentence such as "não há que se dar provimento" reads as PROVIMENTO, so such a voto is rejected (false reject, not false accept). Law's vetoes and holdout are not defined, so nothing here is tuned against them.

## Run

```
node --test harness.test.mjs                       # fake claude binary, no model call
node harness.mjs --mode canned                     # no model; model segments are 0, timing is meaningless
node harness.mjs --mode live --model claude-haiku-5-5 [--out DIR]
```

Exit 0 usable, 1 not usable, 2 blocked.

## Gates (live runs)

`gates.json` lists four gates: independent evaluator, Law vetoes, held-out isolation, case readiness. All are **UNMET**. A live run stops with exit 2 before preflight and before any model call until each gate is `VERIFIED` with a link to a Nercari GitHub issue or PR comment. The owner of a gate (Themis for the three Law gates, the independent evaluator for the first) verifies it. The execution owner never sets a gate. The harness cannot prove who wrote the link; the owner's comment is the proof.

## What the report separates

`timingKind` is `SYNTHETIC_PROXY`: the case is invented and the clock is local plus model. It is not real workflow time. `uploadSec` and `humanReviewSec` are `UNMEASURED`: a real upload and a human review need a real workflow. A model revision after a failed check (up to 2) is timed (`t_revisao_N`), counted in `revisions`, and summed into `totalSec`. `editBurden` stays `UNMEASURED` until matched drafts and finals exist. Rubric or reference distances would be proxies and labeled so. The user-reported time of about five minutes is not a measurement.

## Subscription proof (stop rules)

A live run makes a model call only if all hold, else it stops with exit 2:
- `--model` is given (no default) and is in the allow-list `claude-haiku-5-5`, `claude-sonnet-5-5`. Opus needs Pedro's approval per use and is not allowed.
- None of `ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_BASE_URL`, `OPENAI_API_KEY`, `CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY` is set (also stripped from the child env).
- `claude auth status` shows `loggedIn`, `authMethod claude.ai`, `apiProvider firstParty`, a `subscriptionType`. Only those three fields are stored.
- After each call: exit 0, `is_error` false, `subtype` success, non-empty result, `apiKeySource` null or `none`, and every key of `modelUsage` is in the allow-list and includes the pinned model. Any doubt stops the run before the next call.

`total_cost_usd` is a CLI estimate, not billing. Billing cannot be read from here.

## Limits

- The harness embeds the plugin skills' text in the prompt. It proxies the plugin path. It does not test host skill activation in Claude Chat, Cowork or Code.
- n=1 per run, one fixture, haiku only. Model timing varies run to run. No median, no drift estimate, no paired baseline.
- Tests run locally. `audits/` is not a CI package.

## Smoke runs (2026-11-13, `claude-haiku-5-5`, subscription)

**UNCONFIRMED pending repair (2026-11-13, PR #62 review finding).** The evaluator used for both runs matched the oriented outcome over the whole voto text, so "RECURSO DESPROVIDO" in the ementa alone could pass it, and it did not reject "parcial provimento" or an absent dispositive. The check is repaired in the commit that follows head 37ebddc (see the PR). Both smoke runs were scored by the defective evaluator, so their usability verdicts and segment times are **unconfirmed and count as nothing**. No timing counts as T or as a baseline until the repaired evaluator passes a live run and an independent evaluator approves it. The originals below are kept unchanged. An offline re-verify of the saved run 2 voto with the repaired check gives only `required facts missing`. No new model run was made for this finding.

**Second repair (same date, residual false-usable).** A reasoning paragraph that quotes or attributes a precedent's denial ("A Turma Recursal negou provimento…", "o recurso foi desprovido" in a precedent, a quoted "Nego provimento") was still accepted when this voto had no operative decision. The check now drops quoted spans and sentences that attribute a decision to someone else before it classifies each paragraph, so only this voto's own operative sentences count. Earlier cases (absent, partial, mixed, ementa-only) stay rejected. Legitimate operative decisions stay accepted, including an own decision that cites a precedent. Known limit (keyword list, not a parser): an own decision phrased with an attributed verb is a false reject, never a false accept. All usable-voto timing stays **UNCONFIRMED**. Lock and relock do not apply (no initialized climb); an independent evaluator approval is still required before any `climb.py init`. No model run was made.

See `runs/`. Both runs: receipts clean, output **not usable** under the proxy checks. Run 1 did not save the outputs. Run 2 saved them. After run 2, two checks were found defective and fixed (dispositivo accepted only "nego provimento" and looked at the last paragraph only; a locator inside the ementa broke the upper-case test). The saved run 2 outputs were re-verified offline with no new model call. The two remaining failures are real omissions: the relatório does not name the ré, and the voto does not give the sentence date. `runs/smoke-*/report.json` hold the original reports, produced before the check fix.

**Third repair (independent review FAIL at 58674067).** An infinitive ("deve-se negar provimento") and a negated denial ("Não nego provimento") no longer count as the dispositive. Two views: the operative view (decision forms only) decides the dispositive, the loose view (infinitives and negations too, a negated denial reads INVERTIDO) finds contradictions. Limit: an own decision written as an infinitive, or a sentence opening with "No precedente/julgado/acórdão", is a false reject, never a false accept. Smoke timings stay UNCONFIRMED.

**Fourth repair (Cipher, Codex discussion_r4569573493 at 5c12864).** Attribution now filters at clause scope. In a sentence with an attributed clause, only that clause is dropped. A first-person clause of the same sentence (nego, dou, conheço, voto, julgo) stays in both views, so "Diante do que decidiu a Turma no paradigma, dou parcial provimento ao recurso." now counts as an own PARCIAL and contradicts the denial. A sentence with no attribution is unchanged. Limit unchanged: an attributed clause that is the only own decision is a false reject, never a false accept. Smoke timings stay UNCONFIRMED.

**Fifth repair (independent review run2 FAIL at affad4e2).** A passive without a named source ("foi dado provimento parcial") is no longer attribution. A passive counts as attributed only when a source (Turma, tribunal, acórdão, precedente, julgado, paradigma, câmara, STJ, STF, TNU, TRF) introduces it with a locative or agent preposition (no, na, pelo, pela, em) before the passive. Any other passive stays in both views and can contradict the denial. Limit: an own passive decision that opens with such a source phrase is a false reject, never a false accept. Smoke timings stay UNCONFIRMED.

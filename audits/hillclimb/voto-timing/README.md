# Synthetic voto timing harness

**SYNTHETIC PROXY. Not a real baseline. Not an improvement claim.** Part of the hillclimb baseline card (`../lume-voto-time-edits-2026-11-13.md`). No climb is started. No private or held-out data is used: the case in `fixture/` is invented.

## What it measures

Four segments, each with a monotonic clock: `t_pack` (local pack build plus the plugin's `lume_check.py package`), `t_relatorio` (model), `t_voto` (model), `t_verify` (local structural checks). `totalSec` is set only when the voto passes the checks. Otherwise it is `null` and only `elapsedSec` is reported.

Elapsed time and edit burden stay apart. `editBurden` is always `UNMEASURED`: it needs Law's paired human edits.

The checks are structural proxies, **not Law's vetoes**: required facts, `[doc-NN]` locators exist, «quotes» are literal in the docs, dates and amounts occur in the docs, the relatório does not decide, numbered paragraphs, ementa, no headings, lists or semicolons, and the dispositivo matches the oriented outcome. Law's vetoes and holdout are not defined, so nothing here is tuned against them.

## Run

```
node --test harness.test.mjs                       # fake claude binary, no model call
node harness.mjs --mode canned                     # no model; model segments are 0, timing is meaningless
node harness.mjs --mode live --model claude-haiku-5-5 [--out DIR]
```

Exit 0 usable, 1 not usable, 2 blocked.

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

See `runs/`. Both runs: receipts clean, output **not usable** under the proxy checks. Run 1 did not save the outputs. Run 2 saved them. After run 2, two checks were found defective and fixed (dispositivo accepted only "nego provimento" and looked at the last paragraph only; a locator inside the ementa broke the upper-case test). The saved run 2 outputs were re-verified offline with no new model call. The two remaining failures are real omissions: the relatório does not name the ré, and the voto does not give the sentence date. `runs/smoke-*/report.json` hold the original reports, produced before the check fix.

# Hillclimb baseline card: Lume upload-to-voto time and required edits

Status: **baseline and protocol only. No climb started. No change to the plugin.**
Date: 2026-11-13. PR: #62 (same owner, same branch). Gates nothing in PR #62.

## 1. Request

Reduce (a) the elapsed time from upload to a usable voto and (b) the edits a user must make to that voto. Climbers and judges run on Claude models through the user's subscription only.

## 2. Existing state inspected

| Item | Finding |
| --- | --- |
| Skill | `skills/hill-climb/SKILL.md` and `scripts/climb.py`, `scripts/judge.py` in `nercari-control`. A climb needs: a check command that prints one number, a lock on check files, a holdout, a card. |
| Earlier Lume climbs | Issue #53 (closed): synthetic eval `npm run eval:synthetic` (PR #54, #56). Style-profile eval G5 (PR #59) is private by design. A climb-10 brief exists in `/home/nercari/tmp/lume-climb10-20261112/` with a `STOP` file and an empty result. Its log path `/workspace/reports/lume-hillclimb-2026-11-11/` does not exist on this machine. |
| `judge.py` default | `--panel claude,codex`. A codex seat is a second provider. It is **not allowed** here. Every judge run must pass `--panel claude`. |
| Repo | `intake/` already has a manifest with `tuning` and `held-out` splits. `chat-editor/` has `style-eval-private.mjs`, which runs only on a private directory. |

## 3. Baseline card

Two scores. They are never added, averaged or traded against each other.

| Score | Direction | Baseline | Status |
| --- | --- | --- | --- |
| T: seconds from upload to usable voto | lower | **UNMEASURED** | No Claude-path run exists. No synthetic case pack with a voto target exists. |
| T proxy (extension, ChatGPT path): click to case pack ready | lower | **1.88 s** (median of 3 runs, 150 ms latency) | Measured below. Synthetic. It is a proxy for the ready segment only. It is not T. |
| E: edits needed to the model voto | lower | **UNMEASURED** | No paired human-edited outputs. Law owns them. Edit reduction cannot be claimed. |

Proxy command and output (head 5be57c3, `extension/`, `npm run eval:synthetic -- --runs 3`, no model, no network beyond localhost):

```
fixtureVersion 1, cases 3, runs 3, latencyMs 150
documentsExpected 27, documentsCaptured 27, captureRate 1
stateMatches 27 / stateExpected 27, stateMismatches []
sigiloWarningShown true
ocr: pages 9, cer 0, wer 0
totalSec 1.88
```

Limit: OCR error is 0 on clean synthetic pages. This is a proxy label, not evidence of real-case quality.

## 4. Measurement protocol (fixed before any change)

**T (time).**
1. Segments: `t_pack` (upload or paste until the case pack is ready), `t_report` (until the relatório), `t_voto` (until the first voto that passes the vetoes in section 5). T is the sum. Report the segments too.
2. Harness: a script prints one number. It uses a monotonic clock and records the model id of every call from the CLI result.
3. Input: synthetic, non-private case packs only, labeled **proxy**. A proxy gain is not a real-case gain.
4. Runs: 3 or more, paired against the baseline commit, median. A step counts only when the gain is above the measured drift (`--min-gain`).
5. A time gain counts only when every veto in section 5 still passes.

**E (edits).**
1. Needs pairs: the model voto and the same voto after the human edited it (Law's final). Without pairs, E stays UNMEASURED.
2. Score: normalized token edit distance between the two, plus a count of edit classes Law defines. Reported apart from T.
3. Computed only on Law's machine or by a Law-run script. The repo and this agent receive aggregate numbers and a hash of the case list. They never receive case text.

**Separation.** T and E use different checks, different fixtures and different reports. A change that lowers T and raises E is reported as such. No combined score exists.

## 5. What Law must define before any optimization

Optimization does not start until Law supplies all four. This agent does not guess them.

1. **Hard quality vetoes.** Conditions that make a voto unusable at once (for example a wrong party, a wrong outcome against the chosen position, a missing or invented citation). Law writes the list and the check for each.
2. **Hard safety vetoes.** Conditions on secrecy and disclosure (for example segredo de justiça, a minor's name, leaked case data into a prompt or log).
3. **Holdout.** Law picks, holds and scores the held-out cases. The climber never sees them. Only an aggregate pass/fail and a case-list hash come back.
4. **Edit-class list and E score** definition (section 4, E.2).

Private cases stay with Law. This agent does not read, copy, request or upload private case contents.

## 6. Model and subscription receipts

Climber and judge are Claude only, through the user's subscription. No paid API. No other provider.

Probe (no case data, trivial prompt), run 2026-11-13:

```
env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN claude -p "Reply with the single word: ok" \
  --tools "" --strict-mcp-config --no-session-persistence --output-format json
result: "ok", is_error false, num_turns 1, duration_ms 12553, apiKeySource null
modelUsage: claude-haiku-5-5, claude-opus-5-5
tokens: input 2, cache_creation 9022, cache_read 658, output 4
claude auth status: authMethod claude.ai, apiProvider firstParty, subscriptionType max
ANTHROPIC_API_KEY, ANTHROPIC_AUTH_TOKEN, OPENAI_API_KEY: missing in the environment
```

What this proves: the CLI answers through a claude.ai login on a subscription plan, with no API key in the environment, and it names the Claude models that ran.

What this does not prove:
- `total_cost_usd` (0.07252) is a list-price estimate from the CLI. It is not a bill. This run cannot read billing.
- The default routing used `claude-opus-5-5`. Opus needs Pedro's approval (pstack role `impl-frontier`). Every later run pins `--model` to the model that the playbook row names, and records the `modelUsage` line.
- Account sign-in was not touched.

**Stop rule.** A climber or judge run starts only if: `authMethod` is `claude.ai`, no API key variable is set, `--panel claude` is passed to `judge.py`, and the receipt line above is stored with the run. If any item fails, model runs stop and the exact failing item is reported. A rate-limit or quota error also stops the run. No fallback to a paid API or another provider.

## 7. Blockers and next steps

| Item | State |
| --- | --- |
| Law vetoes, holdout, edit classes | **Blocked on Law.** Needed before a `climb.py init`. |
| Synthetic voto fixture and a Claude-path timing harness | **Built** in `voto-timing/` (invented case, structural proxy checks, subscription preflight and receipt stops, 9 local tests). Two haiku smoke runs: receipts clean, output not usable under the proxy checks, so no timing counts as T. Proxy only. See `voto-timing/README.md`. |
| Paired human-edited outputs | Not available. E stays UNMEASURED. |
| Plugin and council evidence work (PR #62) | Continues independently. Not suspended by this card. |

Not done on purpose: no `climb.py init`, no plugin edit, no model run beyond the one probe, no merge, no account change, no spending.

# verify() same-work comparison, 2026-11-14

SYNTHETIC PROXY. Engineering proxy only. It is not real upload-to-voto time and not human edit reduction. No model, provider, auth or credential call. Invented inputs only. No gate changed. All four gates stay UNMET.

Frozen baseline: `f7f200aaab5a706544ffa32a2048b0817cd833bf` (`harness.baseline-f7f200a.mjs` is byte-identical, checked with `cmp`). Candidate: one edit to `harness.mjs`, shown in the PR comment.

Hypothesis. In `verify`, each numbered paragraph is split into sentences twice (`operative` then `outcomes`). Splitting once and sharing the result gives the same output with fewer regex tests.

Measures. (1) `RegExp.prototype.test` calls over one pass of 17 jobs. (2) Median local microseconds per pass of 17 jobs (7 rounds of 3000 passes). (3) `failuresPerJob` for all 17 jobs.

Invariants. `failuresPerJob` identical to baseline. 26 harness tests pass. A canned run gives byte-identical `relatorio.md` and `voto.md` and `usable` true. No check weakened. No expected output hard-coded.

Inputs. 17 jobs: the canned relatório, the canned voto, and 15 invented variants of the voto (precedent attribution, negation, infinitive, partial, grant, ementa mismatch, semicolon, mixed outcomes). 10 of 17 fail by design. They are the structural failures the checks must keep.

| Run | Module | regex tests | median µs / pass |
|---|---|---|---|
| baseline run 1 | f7f200a | 3123 | 338.22 |
| candidate run 1 | candidate | 2735 | 263.16 |
| baseline run 2 (after) | f7f200a | 3123 | 346.07 |
| candidate run 2 (after) | candidate | 2735 | 266.09 |

Result. Work: 388 fewer regex tests (12.4%), deterministic. Local time: about 22% lower per pass in both orders. `failuresPerJob` identical in all four runs. Canned run of the candidate: exit 0, usable true, outputs identical to `offline-proxy-20261114-canned-run-a/out`.

Meaning. The saving is about 75 µs per 17 verifications. In the canned run `t_verify` is 0.003 s of 0.039 s elapsed, and both candidate and baseline round to the same value. It is a real same-work reduction, not a visible workflow gain. `t_pack` (python subprocess) dominates local time and lives in the plugin path, which this change does not touch.

Limits. One mechanism, one candidate, n=7 rounds. Micro-timing on one machine. Regex test count excludes `replace` and `split`. Human edit burden stays UNMEASURED. Smoke timings stay UNCONFIRMED.

Files: `measure.mjs`, `baseline/`, `candidate/` (`command.txt`, `result*.json`, `stdout*.txt`), `canned-candidate/`.

# Run 37: full synthetic packaging flow through the real caller

SYNTHETIC PROXY. Invented workloads only. Local engineering timing. Not a Law baseline. No model call, no checkpoint, no deletion, no new architecture.

Head: `e63870c7582fde6e1dacf5ac7cd926e0a2c4e06c`. `harness.mjs` and `lume_check.py` are not edited.

## Result

The accepted validator changes cut the full flow by about 24 ms per package step. This holds for every workload size. The saving is nearly constant, because it is the validator process start, not the document size.

| Workload | ref flow ms | head flow ms | Saved ms | Head faster |
| --- | --- | --- | --- | --- |
| fixture-5 (2.2 KB text) | 34.88 | 10.45 | 24.48 | 200/200 |
| medium-30 (148.6 KB text) | 35.62 | 11.50 | 24.00 | 150/150 |
| large-120 (2.57 MB text) | 46.48 | 21.16 | 25.12 | 60/60 |
| `run({mode:"canned"})` wall, fixture-5 | 35.26 | 11.31 | 23.95 | 150/150 |

Medians. Flow = real `buildPack` + real `verify` x2 on canned outputs. Raw per-round values: `results/results.json`. Tables: `results/tables.md`.

## Frozen reference

- `reference/lume_check.py`, md5 `937113188d148d9e992896fc09265a5e`. It is `git show 5fa1da2^:plugins/lume-claude/skills/jef-pacote/scripts/lume_check.py` (equal to `adb3ba7`). It is the validator before the hillclimb.
- Head `lume_check.py`, md5 `4ee94aeedf9b7da6c2ea52fd9b05e053`. Diff: 42 insertions, 9 deletions.

Components that differ between ref and head:

1. `lume_check.py`: lazy `tempfile` (`5fa1da2`), skip `argparse` on `<command> <file>` (`ee7513d`), lazy `pathlib` (`e5033a4`), skip `import json` via `_json` (`e63870c`).
2. Harness argv: original `python3 -I`, head `python3 -I -S` (`d0f900d`).

Held equal in all arms (not in the measured delta): harness `verify()` change `f7077dd`. The head harness runs for every arm, so `verify` cost is the same by construction.

Three arms isolate the two components:

| Arm | Validator | argv |
| --- | --- | --- |
| ref | frozen | `-I` (original) |
| mid | frozen | `-I -S` (head argv) |
| head | shipped | `-I -S` |

Split of the saving (fixture-5): argv alone (ref-mid) 1.34 ms, validator changes (mid-head) 23.37 ms. Medium: 1.49 / 22.61. Large: 1.42 / 23.26.

## How the real caller was used

`buildPack` is imported from `harness.mjs` and called as shipped. Its validator path is a private const, so it cannot be set from outside. `flow-measure.mjs` wraps the CJS `child_process.spawnSync`, `fs.mkdtempSync` and `fs.writeFileSync`, calls `module.syncBuiltinESMExports()`, then does `await import("../../harness.mjs")`. For ref and mid, the wrapper swaps only the validator script path and the `-I`/`-S` flags in the `python3` call. For head it passes the argv unchanged. The wrappers also read `performance.now()`. The same wrappers run for every arm, so their cost is common. `harness.mjs` is not edited.

Command lines (from the worktree root):

```
export TMPDIR=$PWD/.scratch-run37 CLAUDE_CODE_TMPDIR=$PWD/.scratch-run37 PYTHONDONTWRITEBYTECODE=1
node audits/hillclimb/voto-timing/runs/compare-20261114-full-flow/flow-measure.mjs --fixture 200 --medium 150 --large 60 --runs 150 --warmup 5
```

Environment: node v26.12.0, Python 3.14.9, 16 cores, load average about 1.6 at start. Method: 5 warmup rounds, then paired rounds. Each round runs all three arms once, in one of 6 rotated orders (round mod 6), so order effects cancel. Stage times are `performance.now()` deltas inside one process.

## Workloads (invented, seeded PRNG, no real data)

| Workload | Docs | Text total | Doc min / median / max | pack.json | Rounds |
| --- | --- | --- | --- | --- | --- |
| fixture-5 (existing fixture) | 5 | 2,204 B | 388 / 422 / 500 B | 2,804 B | 200 |
| medium-30 | 30 | 148,563 B | 388 / 4,884 / 9,010 B | 151,975 B | 150 |
| large-120 | 120 | 2,570,423 B | 388 / 21,514 / 39,755 B | 2,585,966 B | 60 |

medium and large keep the 5 fixture docs and add filler docs (invented word list, some dates and amounts), so the canned `verify` still passes. Parity-only workloads: `edge-unicode` (accents, emoji, quotes, backslash, control chars, empty text), `err-duplicate-id`, `err-empty-id`, `err-whitespace-id`, `err-empty-docs`.

## Cost per stage (median ms, ref -> head)

Stages: pack_build (before `mkdtempSync`), mkdtemp, stringify (`JSON.stringify` + `path.join`), write (`writeFileSync` + `path.join`), spawn (validator process, to exit), tail (`JSON.parse` + status check), verify (2 canned checks).

| Stage | fixture-5 | medium-30 | large-120 |
| --- | --- | --- | --- |
| pack_build | 0.02 -> 0.02 | 0.02 -> 0.02 | 0.02 -> 0.02 |
| mkdtemp | 0.04 -> 0.04 | 0.04 -> 0.04 | 0.06 -> 0.07 |
| stringify | 0.01 -> 0.01 | 0.15 -> 0.15 | 2.64 -> 2.65 |
| write | 0.04 -> 0.04 | 0.11 -> 0.11 | 1.00 -> 0.98 |
| **spawn** | **34.67 -> 10.25** | **35.13 -> 10.96** | **41.18 -> 16.80** |
| tail | 0.01 -> 0.01 | 0.01 -> 0.01 | 0.01 -> 0.01 |
| buildpack_total | 34.79 -> 10.38 | 35.48 -> 11.38 | 46.02 -> 20.67 |
| verify | 0.08 -> 0.08 | 0.12 -> 0.11 | 0.47 -> 0.49 |
| flow_total | 34.88 -> 10.45 | 35.62 -> 11.50 | 46.48 -> 21.16 |

The validator spawn is the only stage that moves. Every other stage is within noise (paired medians under 0.03 ms; "head faster" counts near half). Spread: IQR of spawn is about 2 ms in ref and about 1.7 ms in head for fixture-5. Full IQR, min, max and paired deltas for every stage are in `results/results.json`.

Where the head time goes now: the spawn is 10.3 ms of the 10.45 ms fixture flow (98%). On large-120, spawn is 16.8 of 21.2 ms; the extra 6.5 ms over fixture-5 is Python reading and validating 2.6 MB, plus 3.6 ms for JS stringify and write.

`run({mode:"canned"})` on fixture-5 (150 rounds): wall 35.26 -> 11.31 ms. Segment `t_pack` 35 -> 11 ms. `t_relatorio`, `t_voto`, `t_verify` all read 0.000 s (the harness rounds to 1 ms; each is under 0.5 ms). The `run()` report (minus timings) is equal across arms, `modelCalls` is 0.

## Output and error parity

For every workload and every arm, 2 passes each: validator stdout, stderr, exit status, pack file sha256 and size, `verify` failure lists, and the thrown `pack check failed` message. Result: head equals ref and mid equals ref on all 8 workloads. 0 mismatches.

| Workload | Docs | Outcome (all arms) |
| --- | --- | --- |
| fixture-5, medium-30, large-120, edge-unicode | 5 / 30 / 120 / 7 | PASS, same stdout |
| err-duplicate-id, err-empty-id, err-whitespace-id, err-empty-docs | 2 / 1 / 1 / 0 | FAIL thrown, same error text |

Document count, text size and pack size are the same for all arms (same harness builds the pack). Earlier parity evidence stays valid: run 36 had 180 comparisons and 12,027 `loads` and 4,008 `dumps` fuzz cases with 0 mismatches.

## Limits and risks

- `run()` can only load the fixture (`loadDocs` is hardcoded). Medium and large use the same `buildPack` and `verify` calls, composed in `flow-measure.mjs`, with canned outputs. They are not `run()` itself.
- The `spawnSync` redirect relies on `syncBuiltinESMExports`. It is recorded here, and head uses the unchanged argv.
- Harness `verify` (`f7077dd`) is equal in all arms. Its gain is not in these numbers.
- The 24 ms saving is of the local validator step only. A live flow adds two model calls of tens of seconds. Against that, this saving is small. No claim about live total time.
- `buildPack` leaves its `voto-pack-*` temp dirs. They sit in `.scratch-run37/` (untracked, not cleaned: deletion is prohibited).
- Checkpoint parity not run.
- Next lever, if wanted: spawn is 98% of head flow time. Anything lower needs a persistent process or bytecode cache. Both change the architecture. Not measured and not done.

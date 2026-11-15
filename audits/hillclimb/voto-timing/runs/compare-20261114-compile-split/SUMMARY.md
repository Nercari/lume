# Run 38: validator compile split, measured through the real caller

SYNTHETIC PROXY. Invented workloads only. Local engineering timing. Not a Law baseline. No model call, no checkpoint run, no deletion.

Baseline: head `e63870c` (run 37 accepted state, unchanged). `harness.mjs` and the shipped `lume_check.py` are not edited. Nothing is pushed.

## Decision

**Hypothesis REJECTED for landing: supported gain, not meaningful.** Candidate B saves about 1 ms per package step (about 10% of the flow). The paired result is real, but the cost in the shipped validator is higher than the gain. No change to the shipped validator. The candidates stay here as evidence. Landing stays a one-step copy if the operator wants it.

## Where the remaining time is (median ms, 300 paired rounds)

| Part | ms |
| --- | --- |
| Process spawn floor (`true`) | 1.14 |
| Interpreter floor `python3 -I -S -c pass` | 6.56 |
| Shipped validator, `package` on fixture-5 | about 9.0 |
| Gap above interpreter floor | about 2.5 |
| of which: compile of the script source (no bytecode cache for `__main__`) | about 1.7 |
| of which: `import types` / `_json` | 0.2 / 0.13 |

Only the 2.5 ms gap is controllable without a persistent process or a bytecode cache.

## Rejected micro-hypotheses (no gain, or worse)

`-X frozen_modules=on`, `-X utf8=1`, `-X int_max_str_digits=0`, `-X no_debug_ranges`, `-O`, `-OO`, `-X no_debug_ranges -OO`, absolute `/usr/bin/python3.14`. Compile time of the script is also unchanged under `-X no_debug_ranges`, `-O` and `-OO` (1.66 to 1.75 ms).

## Candidates (`candidates/`, built from the shipped file by `make-candidates.py`)

- **A**: drop `from types import SimpleNamespace`; use a 2-line local class. Flow: 0.08, 0.10 and -0.27 ms. Not supported. Rejected.
- **B** (includes A): move `locators`, `blocks`, `diff`, `state`, `checkpoint` into a raw string; `exec(compile(...))` it only when the command is not `package`. Moved function text is identical to head (`rest-check.txt`).

## Result: full flow through the real `buildPack` (paired, rotated order, median ms)

| Workload | base flow | candB flow | Saved | candB faster | base spawn | candB spawn |
| --- | --- | --- | --- | --- | --- | --- |
| fixture-5 | 9.25 | 8.26 | 0.96 | 150/200 | 9.07 | 8.08 |
| medium-30 | 10.20 | 8.98 | 1.12 | 119/150 | 9.76 | 8.52 |
| large-120 | 19.64 | 18.43 | 0.83 | 44/60 | 15.46 | 14.26 |
| `run({mode:"canned"})` wall, fixture-5 | 9.80 | 8.34 | 1.31 | 124/150 | | |

Every non-spawn stage is within noise (pack_build, mkdtemp, stringify, write, tail, verify: paired medians under 0.02 ms). Candidate A alone: 9.20 vs 9.25 (fixture-5), no support. Raw rounds: `results/results.json`. Tables: `results/tables.md`.

Method: 5 warmup rounds, then paired rounds; each round runs base, A and B once in one of 6 rotated orders (round mod 6). `flow-measure.mjs` wraps `child_process.spawnSync`, `fs.mkdtempSync` and `fs.writeFileSync`, calls `module.syncBuiltinESMExports()`, then imports `harness.mjs` unedited. Same wrappers for all arms. The base arm passes the argv unchanged, so it is the shipped head. Environment: node v26.12.0, Python 3.14.8, i5-12600K, 16 cores, load average 2.1 at start. (Run 37 `SUMMARY.md` says Python 3.14.9; `python3 -VV` here reports 3.14.8. The old file is not edited.)

## Parity

- Full flow, 8 workloads (fixture-5, medium-30, large-120, edge-unicode, err-duplicate-id, err-empty-id, err-whitespace-id, err-empty-docs), 2 passes per arm: validator stdout, stderr, status, pack sha256 and size, `verify` failures, thrown message. A and B equal base on all 8. 0 mismatches. `run()` report (minus timings) equal, `modelCalls` 0.
- Run-36 corpus (`parity-nocheckpoint.mjs`, 180 comparisons: valid, invalid, raw JSON edge cases, `locators`, `diff`, argparse paths) head vs A and head vs B: 0 mismatches each (`parity-candA.json`, `parity-candB.json`). Tracebacks compare the last line only.
- Checkpoint parity not run (deletion hold; `checkpoint` calls `os.unlink`). Candidate B only moves its text unchanged and defines it before use (`rest-check.txt`).

## Why not landed

- 1 ms is small. A live flow adds two model calls of tens of seconds.
- Cost: shipped validator carries `exec` of a string constant. Moved commands show `<rest>` in tracebacks. A reader no longer sees the functions as code. The file is generated into 9 skill copies that tests compare.
- Earlier accepted wins were plain import changes of 1 to 13 ms. This one changes the file's shape.

## Next candidate

Nothing left inside the offline path that is both plain and above noise. The spawn is 98% of the flow and the interpreter floor is 6.56 ms. Two options need the operator's decision, because they change architecture:

1. Run the `package` checks in-process in `harness.mjs` (no spawn, about 9 ms saved). Duplicates the validator logic in JavaScript.
2. A persistent validator process or a bytecode cache. Both are prohibited without asking.

## Limits

Synthetic workloads. `buildPack` leaves `voto-pack-*` temp dirs in `.scratch-run37/` (untracked, not cleaned). Smoke timings stay UNCONFIRMED. All four gates stay UNMET.

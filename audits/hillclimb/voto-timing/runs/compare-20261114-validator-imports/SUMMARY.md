# Validator import cost, 2026-11-14 (SYNTHETIC PROXY, local engineering timing only)

Not a Law baseline. Not a whole-workflow gain. No model call, no network, invented fixture docs. All gates stay UNMET.

## Status: candidate MEASURED, repo tree NOT changed (blocked on one destructive step)
The normal generator `node plugins/scripts/build-lume-claude.mjs` (write mode) runs
`rmSync(OUT, { recursive: true, force: true })` at `plugins/scripts/build-lume-claude.mjs:157`, with `OUT = plugins/lume-claude`.
That is a recursive delete of the generated tree. The run31 follow-up bans deletion and says to stop and name it. So the source
`plugins/lume-workspace/skills/jef-director/scripts/lume_check.py` and the 9 generated copies are untouched. `--check` still PASSES (161 files match).
There is no tracked zip or `.sha256` in this checkout (`*.zip` is gitignored), so no tracked hash exists to regenerate.

## Candidate (ONE change), stored here as a copy, not applied
`lume_check.candidate-lazy-tempfile.py` vs `lume_check.baseline-d0f900d.py` (byte copy of the source at d0f900d):
- line 2: `import argparse, json, os, re, tempfile` becomes `import argparse, json, os, re`
- line 80: `tempfile.mkstemp(` becomes `import tempfile;handle,tmp=tempfile.mkstemp(` (only the `checkpoint` path uses it)

`argparse` is NOT lazied: `main()` uses it for every command, and replacing it would change usage errors and exit codes.

## `python3 -X importtime` (cumulative us, `-I -S`)
Files: `importtime-baseline-d0f900d.txt`, `importtime-candidate-lazy-tempfile.txt`.
- baseline: tempfile 3547, argparse 7066, _colorize 7904 (pulled in by argparse).
- candidate: tempfile no longer imported on package/locators/diff; argparse 5659 stays.
So `argparse` is the larger cost and stays; `tempfile` is the part that can move without a behavior change.

## Timing (200 interleaved rounds, median ms of spawn + check, `-I -S`, two runs)
| | baseline | candidate | delta |
|---|---|---|---|
| run r1 | 33.05 | 31.88 | 1.17 |
| run r2 | 33.00 | 31.66 | 1.33 |
Files: `candidate/result-r1.json`, `result-r2.json`. `result-run1/2.json` and `stderr-run1/2.txt` are a failed first attempt (stray CLI arg), kept.

## Parity
- Same exit status, stdout and stderr on the valid pack and 8 invalid packs (`allInvariantsEqual: true` in both runs).
- `checkpoint` command (the one path that imports `tempfile`): same exit, stdout, and output file bytes.
- Harness tests and `plugins/test`: 61/61 (26 + 35) on the unchanged tree.

## Claim
About 1.2 to 1.3 ms (about 4%) per `t_pack`, a micro-gain on `t_pack` only if applied. It is not a whole-workflow gain.

## To apply (needs the delete to be allowed)
1. Apply the 2-line diff to the source `lume_check.py`.
2. `node plugins/scripts/build-lume-claude.mjs` (deletes and rewrites `plugins/lume-claude`), then `--check`.
3. Re-run harness and plugin tests.

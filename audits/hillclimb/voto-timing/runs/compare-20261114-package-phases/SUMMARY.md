# Package path: where the time goes, and the change that landed (run34)

Synthetic proxy for `t_pack`. Not a Law baseline. Not a whole-workflow claim. Python 3.14.9, `python3 -I -S`, 200 rounds, medians.

## Ranking (baseline 5fa1da2, full spawn plus check 31.344 ms)

| Rank | Mechanism | ms |
|---|---|---|
| 1 | `ArgumentParser()` construction (3.14 lazy `_colorize`, then `dataclasses`, `inspect`) | 10.463 |
| 2 | Interpreter start floor (not changeable) | 7.399 |
| 3 | `import argparse` (includes `re`, 3.7 ms cumulative) | 5.629 |
| 4 | `from pathlib import Path` | 2.019 |
| 5 | `import json` | 0.857 |
| 6 | exec module body | 0.100 |
| 7 | `parse_args` | 0.071 |
| 8 | `Path.read_text` | 0.055 |
| 9 | `json.loads` | 0.018 |
| 10 | `package()` checks | 0.018 |
| 11 | `json.dumps` result | 0.011 |

Raw: `importtime-run1..3.txt`, `phases-result.json`, `phase-probe.py`, `run-phases.mjs`.

## Chosen mechanism

Skip `argparse` (import plus construction, about 16 ms) when argv is the plain `<command> <file>` shape. Any other argv goes through `argparse` unchanged, so `--help`, usage errors and exit 2 stay identical.

## Parity

`parity.mjs`: 87 comparisons, 0 mismatches (exit status, stdout, stderr, checkpoint output bytes). Nine packs through `package`, `locators`, `diff` and both `checkpoint` shapes, plus 17 argv shapes. Includes the valid pack and all 8 invalid packs.

## Timing (200 interleaved rounds, baseline copy vs candidate)

| Run | Baseline | Candidate | Delta |
|---|---|---|---|
| 1 | 31.285 ms | 18.215 ms | 13.070 ms |
| 2 | 31.280 ms | 18.314 ms | 12.966 ms |
| Landed jef-pacote copy | 31.428 ms | 18.360 ms | 13.068 ms |

Noise threshold 0.3 ms. The gain is far above it and stable. `measure-first-variant/` keeps the first variant (lazy `re` inside `blocks()`, 12.7 ms). The landed variant keeps `re` at the top: same gain, one line less.

After the change `argparse` is gone from `importtime-candidate.txt`. Remaining ranked cost: interpreter start, then `json` (via `re`, about 4.2 ms), then `pathlib` (about 2.1 ms). Those are the next candidates.

## Landed

Source `plugins/lume-workspace/skills/jef-director/scripts/lume_check.py` only. 11 generated copies synced with `sync-generated.mjs` (keysets equal, 161 files). `--check` PASS. Tests 26/26 and 35/35 (`check-output.txt`, `sync-generated-output.txt`, `tests-after.txt`).

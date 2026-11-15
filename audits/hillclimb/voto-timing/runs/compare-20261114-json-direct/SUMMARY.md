# Run 36: skip `import json` on the package path

SYNTHETIC PROXY. Local engineering timing only. Not a Law baseline.

Baseline: `e5033a4` (`lume_check.py`, byte-equal copy in `baseline/`).
Candidate: `candidate/lume_check.py`. One mechanism.

## Cost left at e5033a4 (wall clock, 200 interleaved rounds, medians, `-I -S`)

Source: `breakdown.mjs`. Import times: `importtime-baseline.txt`.

| Item | ms | Over floor |
| --- | --- | --- |
| Interpreter floor (`-c pass`) | 7.65 | 0 |
| `import os` | 9.32 | 1.66 |
| `import re` | 12.82 | 5.16 |
| `import json` (loads `re`) | 14.02 | 6.37 |
| `json`+`os`+`re`+`types` | 14.55 | 6.90 |
| Script `package` | 16.55 | 8.90 |

- `json` is the largest cost that can move. `json.decoder` imports `re` (4.35 ms of the 5.27 ms cumulative `json`).
- The package path never needs `re` beyond `json`. `re` is used only in `blocks()` (`diff`). `os` is used only in `checkpoint()`.
- Outside `lume_check.py`: `mkdtempAndWrite` is 0.11 ms. Nothing else moves.
- Script work after the imports is about 2.0 ms (compile, read, validate, print). It is under the noise per item.

## Change

- `loads()`: C scanner from `_json` (`make_scanner`) on the stripped text. Used only if the whole text is one value.
- `dumps()`: C encoder from `_json` (`make_encoder` + `encode_basestring`), the same encoder `json.dumps(ensure_ascii=False)` uses.
- Any exception or doubt (BOM, extra data, bad JSON, NaN edge, deep nesting, non-serializable) retries through `json.loads` / `json.dumps` outside the `except` block. Error text comes from `json`, so it stays identical.
- `json`, `os` and `re` move into `checkpoint()` and `blocks()`. Checkpoint code is unchanged.
- Limit: `_json` is a private CPython module. A shape change only disables the fast path (fallback), not correctness.

## Parity (no `checkpoint` argv anywhere)

- `parity-nocheckpoint.mjs`: 180 comparisons, 0 mismatches. Exit status, stdout, stderr. 93 earlier shapes plus JSON-layer raw inputs (whitespace, BOM, NaN, Infinity, big ints, deep nesting, escapes, duplicate keys, bad JSON) and unicode error output. Uncaught tracebacks compare only the exception line, without the stack-usage figure (varies between runs of the same script).
- `unit-json-layer.py`: 12,027 `loads` cases (7,567 valid) and 4,008 `dumps` cases against `json`, 0 mismatches (seeded fuzz).
- Fast path confirmed: `json`, `re`, `os` are not loaded on the package path (`importtime-candidate.txt`: only `types`, `_json`).
- Checkpoint parity: NOT RUN (deletion hold).

## Timing (`measure-validator.mjs`, 200 rounds, interleaved, order flipped)

| Repeat | Baseline ms | Candidate ms | Delta ms |
| --- | --- | --- | --- |
| 1 | 15.804 | 9.782 | -6.02 |
| 2 | 15.791 | 9.600 | -6.19 |
| Landed copy (`jef-pacote`) | 15.763 | 9.660 | -6.10 |

Noise bar 0.3 ms. Both repeats are above it. All 9 invariants equal.

## What is left (candidate, about 9.7 ms)

- Interpreter start: about 7 ms. A spawned `python3 -I -S` cannot go lower from inside `lume_check.py`.
- Script compile, read, validate, print, `types`, `_json`: about 2.5 ms in total. No single item is above the noise.
- Next segment, if the operator wants more: the cost is the process spawn in `buildPack` (`harness.mjs`). The levers are outside `lume_check.py`: a long-lived validator process or a precompiled module. Both change the caller or write bytecode. Not measured here.

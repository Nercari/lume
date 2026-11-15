# Package path: lazy pathlib (run35, HQ657)

Synthetic proxy for `t_pack`. Not a Law baseline. Python 3.14.9, `python3 -I -S`, 200 interleaved rounds, medians. Baseline is the ee7513d copy.

## Cost check (`-X importtime`, ee7513d)

`json` 5.2 ms cumulative, of which `re` 4.2 ms. `pathlib` 2.1 ms cumulative (`pathlib._os`, `glob`, `ntpath`, `fnmatch`). `json` cannot be dropped without reimplementing it or using private `_json`, which would change error messages. `pathlib` can be deferred. Raw: `importtime-baseline.txt`, `importtime-candidate.txt`.

## Candidate

`read(p)` uses plain `open(p)`. On `OSError` or `ValueError` it retries through `Path(p).read_text()`, so error text and path normalization (`""`, `F/`, `./F`) stay identical. `pathlib` is imported inside `checkpoint()` and inside the `checkpoint` branch of `main()`.

## Timing

| Repeat | Baseline | Candidate | Delta |
|---|---|---|---|
| 1 | 18.263 ms | 15.807 ms | 2.456 ms |
| 2 | 18.118 ms | 15.724 ms | 2.394 ms |
| Landed jef-pacote copy | 18.236 ms | 15.688 ms | 2.548 ms |

Noise threshold 0.3 ms. Both repeats are above it. Kept.

## Parity

`parity-nocheckpoint.mjs`: 93 comparisons, 0 mismatches (exit status, stdout, stderr). Covers the valid pack and 8 invalid packs and 4 more docs through `package`, `locators`, `diff`; 8 raw inputs (empty, invalid JSON, BOM, latin-1, array, null, trailing text, accents); 28 argv shapes (help, usage errors, exit 2, `""`, `.`, `..`, `F/`, `./F`, `sub//F`, directory, missing, unreadable file).

## NOT RUN (deletion hold)

Checkpoint parity. The change moves the `pathlib` import into `checkpoint()` and the checkpoint branch of `main()`. That path is unproven. Test suites (26 and 35) not run: they spawn `checkpoint`. `build-lume-claude.mjs --check`: PASS, 161 files.

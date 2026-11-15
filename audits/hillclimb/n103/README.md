# N103 relatorio and voto climb

Baseline: Lume 1.1.14 plugin. Result: local N103 check 5 -> 0 in 5 kept steps (climb `n103-relvoto`, bar 0).

Check: `python3 scripts/count_lume_runtime.py <plugin-dir>` (prints `RUNTIME_SCORE: N`). Fixtures are synthetic and locked by `fixtures/n103.sha256`.

`patch/1.1.14-to-1.1.15.patch` is the plugin diff against 1.1.14 (cenarios.md rows, one sentence in jef-relatorio, three in jef-voto, version bump). It is not applied to `plugins/lume-claude` here, which differs from 1.1.14.

The guard scripts (count_lume_open, daily, hard, north, e2e, lint, N101/N102/N106) are not in this tree. They were copied from the 1.1.14 climb folder for the run and are not committed.

Card, log and report are in `card/` and `report.txt`.

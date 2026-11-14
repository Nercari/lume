# Offline canned proxy runs, 2026-11-14

SYNTHETIC PROXY. These numbers are engineering proxies. They are not real upload-to-voto time and not human edit reduction. No model was called. No provider, auth or credential call was made.

Revision: `995d919e6f3ea87f33bd6a730c47563bbf551ba2`. Node v26.12.0. Mode `canned` (canned text from `fixture/canned`, invented case, 5 fixture documents).

Command (exit 0 in both runs):

```
TMPDIR="$CLAUDE_CODE_TMPDIR" node audits/hillclimb/voto-timing/harness.mjs --mode canned --out <run dir>/out
```

| Run | t_pack | t_relatorio | t_voto | t_verify | elapsed | usable | failures |
|---|---|---|---|---|---|---|---|
| run-a | 0.035 | 0 | 0 | 0.003 | 0.038 | true | none |
| run-b | 0.036 | 0 | 0 | 0.003 | 0.039 | true | none |

Seconds. `t_relatorio` and `t_voto` are 0 because the text is read from a fixture, so only `t_pack` and `t_verify` are real local timings. Cases: 1 fixture case, 2 outputs checked (relatorio, voto) by the structural proxy checks. The checks are not Law vetoes.

Failed attempts kept as evidence:

- `offline-proxy-20261114/`: EDQUOT (-122) in `buildPack` at `harness.mjs:96`, `os.tmpdir()` on a full volume.
- `offline-proxy-20261114-canned-trial1/` and `-trial2/`: ENOENT at `harness.mjs:215`. The harness does not create `--out`. The pack segment passed. The command was missing `mkdir`.

Not done: no candidate comparison (no candidate exists and the canned mode has no model), no live or fake-claude test run, no gate change. `editBurden` stays UNMEASURED. All four gates stay UNMET.

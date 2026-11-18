# t_pack comparison, 2026-11-14 (SYNTHETIC PROXY, local engineering timing only)

Not a Law baseline. Not a whole-workflow gain. No model call, no network, invented fixture docs. All four gates stay UNMET.

## Scope check
- `t_pack` = `buildPack` in `harness.mjs`: one temp file write, then one `python3 -I lume_check.py package <file>` spawn.
- The script path is `plugins/lume-claude/skills/jef-pacote/scripts/lume_check.py`. It is tracked in this repo.
- It is a GENERATED copy. `plugins/scripts/build-lume-claude.mjs` builds it from `plugins/lume-workspace` (source: `plugins/lume-workspace/skills/jef-director/scripts/lume_check.py`) and copies it into 8 skill folders. `--check` and `lume-claude-chat.zip.sha256` pin it. This run did NOT edit it.

## Hypothesis
`t_pack` is Python process start and imports, not harness work. Test: split the time into temp write, spawn plus check, and bare Python start.

## Result (200 rounds, interleaved, median ms; two runs)
| Step | run1 | run2 |
|---|---|---|
| mkdtemp + write | 0.128 | 0.109 |
| spawn + check, baseline `-I` | 38.4 | 34.4 |
| spawn + check, candidate `-I -S` | 36.8 | 32.9 |
| bare `python3 -I -c pass` | 19.2 | 17.6 |
| bare `python3 -I -S -c pass` | 8.0 | 7.0 |

Harness-side work is 0.1 ms of about 35 ms. The check costs about 15 ms above bare start, from its imports (argparse, json, re, tempfile).

## Candidate (ONE change)
`harness.mjs` argv `["-I", script, ...]` becomes `["-I", "-S", script, ...]`. `-S` skips the `site` import. The validator file and its checks are unchanged.

## Invariants (all held)
- Same exit status, stdout and stderr for the valid pack and 8 invalid packs (empty documents, duplicate id, lido with gap, invalid status, part missing id, part number gap, total_parts 0, non-object).
- Work counts equal: 1 spawn, 1 file write per pack.
- Canned run: exit 0, `relatorio.md` and `voto.md` byte-identical to run30 outputs; harness tests 26/26; `plugins/test` 35/35.

## Claim
About 1.4 to 1.6 ms less per `t_pack` (4 to 5%), same direction in both runs. A micro-gain, about 4% of one local segment. It does not change the model segments, Law vetoes, edit burden, or any gate.

## Next step needs HQ
About 15 ms is left in the validator imports. Cutting it (lazy `tempfile`/`argparse`) means editing `plugins/lume-workspace/.../lume_check.py`, regenerating 9 copies, and changing the shipped zip hash. That alters the shipped package validator and artifact, so it is not done here.

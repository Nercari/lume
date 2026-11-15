# Profile ending vs D1 menu (run 46)

Tree: `d2d5696` + cherry-pick of `695de03` (built copy `plugins/lume-claude`). Model: local `claude -p --model sonnet`, no tools, no session.
Profile (`perfil-estilo.md`) asks for one free sentence as the relatório ending and no menu.
Case: relatório and minuta asked, no outcome (synthetic fixture LRV10-01).

| Case | Runs | Fixed menu, 4 options | Profile sentence | Voto drafted |
|---|---|---|---|---|
| control (no profile) | 1 | 1 | 0 | 0 |
| with profile | 3 | 3 | 0 | 0 |

Result: the fixed menu wins. No conflict. `contrato.md:9` decides it: the case "exige" the fixed section 3, and "respeitar o encerramento do perfil" applies only to "Nos demais casos". `contrato.md:29` ("respeitar perfil") adapts the structure and adds section 3 for this case.
Residual: 3 runs, one model, one profile wording. A profile that also sets the ending of the outcome-defined case is untested.
Rerun: `python3 run.py --root <repo> --runs 3` (add `--no-profile` for control). Outputs: `out-*.md`.

# Data-flow and permission matrix

Part of #3. This file is the non-identifying template. It holds no case data, no account
identifiers and no names. The filled copy with account details stays in `intake/private/`
(ignored by git).

## Rule

A cell is `NPUD` (not permitted until determined) when no determination exists for it.
A cell changes only when a determination in the register below covers it. The
determination ID goes in the cell. The maintainer's personal authorization does not
change a cell (see `official-sources.md`).

Codes:

- `NPUD`: not permitted until determined. This is the default.
- `OK <basis>`: permitted, with the basis.
- `NO <basis>`: prohibited, with the basis. No determination can change it in this
  project.

Columns:

- **Local reading**: Lume reads the data on the maintainer's workstation (from PJe, a
  file, or OCR). No data leaves the workstation.
- **Provider transmission**: data goes to a model provider or account.
- **Retention**: data stays after the session (disk, browser storage, provider history).
- **PJe editor insertion**: Lume puts text into the PJe editor, only on a user action.
- **GitHub / CI**: data appears in issues, PRs, commits, CI logs or artifacts.

## Matrix

| ID | Data class | Local reading | Provider transmission | Retention | PJe editor insertion | GitHub / CI |
|----|------------|---------------|-----------------------|-----------|----------------------|-------------|
| S0 | Synthetic fixtures (made up, no real case) | OK repo rule | OK repo rule (no calls in tests) | OK repo rule | NO not a real case | OK repo rule |
| A1 | Non-identifying acceptance summaries (opaque IDs, slice names, scores) | OK issue #3 | NPUD | OK issue #3 | NO not case content | OK issue #3 (must pass `lint-public`) |
| D1 | Public procedural data of a non-sigiloso case (number, class, movements) | NPUD (DIGES-2) | NPUD (INST-2, INST-3) | NPUD (INST-4) | NPUD (INST-1) | NO issue #3 |
| D2 | Documents of a non-sigiloso case that contain personal data | NPUD (DIGES-2) | NPUD (INST-2, INST-3) | NPUD (INST-4) | NPUD (INST-1) | NO issue #3 |
| D3 | Sensitive personal data in documents (health, minors, and similar) | NPUD (DIGES-2) | NPUD (INST-2, CNJ-2) | NPUD (INST-4) | NPUD (INST-1) | NO issue #3 |
| D4 | Sigiloso or segredo-de-justiça documents | NPUD (DIGES-2) | NPUD (CNJ-2; Res. 615 art. 19 §3 IV) | NPUD (INST-4) | NPUD (INST-1) | NO issue #3 |
| D5 | Scans and OCR text made from D1 to D4 | same as source class | same as source class | same as source class | same as source class | NO issue #3 |
| D6 | Pseudonymized or "anonymized" copies of D1 to D4 | same as source class | NPUD (CNJ-2; issue #3 item 4) | NPUD (INST-4) | NPUD (INST-1) | NO issue #3 |
| D7 | Human reference annotations (facts, contradictions, gaps, inventory) | same as source class | NPUD (CNJ-2) | NPUD (INST-4) | NO not draft text | NO issue #3 (only A1 summaries) |
| D8 | Prompts and model output that contain case content | same as source class | NPUD (INST-3) | NPUD (INST-4) | NPUD (INST-1) | NO issue #3 |
| D9 | Credentials, session cookies, tokens | NO repo rule | NO repo rule | NO repo rule | NO repo rule | NO repo rule |

Notes:

- D5 to D8 inherit the class of the most restricted source document that they contain.
- A provider setting such as `store:false` or a training opt-out is a condition. It is
  not a determination (issue #3, item 4).
- D1 to D4 local reading is `NPUD` because Portaria Diges 467/2026 art. 2, II and III
  can apply to automated reading through the user's session (BLOCKER DIGES-1, DIGES-2).
  The maintainer's normal manual reading in PJe is ordinary work and is out of scope of
  this matrix.

## Determination register

| Determination ID | Issuer (role, not name) | Date | Cells covered | Reference (non-identifying) |
|------------------|-------------------------|------|---------------|-----------------------------|
| (none yet) | | | | |

When a determination arrives, add a row, then change only the cells it covers.

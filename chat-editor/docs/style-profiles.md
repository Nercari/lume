# Style profiles (G5)

A style profile is one user's voto **form**: ementa, paragraph layout, opening, closing
formula, fee line, stock phrases. It never carries facts. The default profile is JEF-V1
(the maintainer's own form); any user can replace it with their own.

## What a profile is

`src/style-profile.js` documents the shape. Three parts:

- `instructions`: short rules the model reads.
- `examples`: the user's own votos, as style samples. Private.
- `form`: the checkable part. `scoreDraft(text, profile, outcome)` scores a draft against it
  with deterministic checks and returns numbers only.

`profiles/` holds the default form (no examples) and two synthetic profiles that are
deliberately unlike it. They exist to prove a profile steers the draft: a draft written
under profile A must score high on A and low on B.

## Where a user's profile lives

Per user and private, never in this repo:

| Surface | Today | Missing |
|---|---|---|
| ChatGPT plugin | `jef-estilo` derives `perfil-estilo.md`; the user saves it as a Project file | `jef-voto` and `c6.md` say to apply JEF-V1 "integralmente". Nothing says a saved `perfil-estilo.md` replaces the JEF-V1 form rules (FMT-001 to FMT-009). The Director's precedence puts "preferências aprovadas" above JEF-V1, but `perfil-estilo.md` isn't named as one. `jef-estilo` also emits no `form` block, so adherence can't be scored |
| chat-editor | `CaseSession({ profile })` takes `{ instructions, examples }` and the caller persists it | `form` (added here) |
| Extension / manual pack | Nothing. The manual prompt only allows a pasted style block | A stored profile |

## Smallest design to close the gaps

1. `jef-estilo` writes `perfil-estilo.md` with the free-text rules plus one fenced JSON
   `form` block in the shape above.
2. One precedence line in `jef-voto` (and `jef-director`): when the Project has
   `perfil-estilo.md`, its form rules replace FMT-001 to FMT-009. JEF-V1 stays the default
   when no profile exists. Method, facts and ID/page rules don't change.
3. Extension: keep the profile in `chrome.storage.local` under `lumeStyleProfile` (local to
   that browser profile, not synced). Use a separate key from `lumeProfile`, which is the PJe
   calibration profile. Add an import/export button in the panel and include the style block
   in the case pack prompt.
4. The private eval (`scripts/style-eval-private.mjs`) scores drafts under each profile.
   It writes aggregate scores only.

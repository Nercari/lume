# N103 vs the 1.2.0 rules: reconciliation (run 42, read-only)

Tree read: `plugins/lume-workspace` at 23ba08e. Paths below are under `plugins/lume-workspace/skills/`. No product file was edited. Rule texts are quoted from the files; nothing here is a rule rewrite.

## Rule texts used

- **R1** `jef-director/references/contrato.md:9`: "Minuta diretamente pedida com orientação definida não exige relatório visível nem reconfirmação. Pedido só de relatório encerra no relatório. Relatório e minuta sem orientação exigem uma pergunta breve após o relatório, salvo autonomia decisória expressamente concedida; respeitar o encerramento do perfil."
- **R2** `jef-director/references/contrato.md:29`: "relatório em chat: 1 Sentença; 1.1 resultado; 1.2 fundamentos; 2 Recurso concluso para julgamento; 2.1 recorrente; 2.2 razões e provas; 2.3 pedidos. [...] Não recomendar resultado por iniciativa própria."
- **R3** `jef-relatorio/references/c4.md:7`: "Se também houver minuta pedida e orientação material ausente, fazer somente a pergunta necessária após o relatório, respeitando o perfil e a autonomia expressamente autorizada. Resultado já fixado dispensa pergunta."
- **R4** `jef-voto/SKILL.md:8`: "Sem posição materialmente necessária, pergunte somente a escolha pendente; resultado já dado dispensa reconfirmação."
- **R5** `jef-voto/references/c6.md:3`: "Encerramento e perguntas seguem o contrato e o perfil; não impor seção de posição nem componentes não pedidos."
- **R6** `jef-voto/references/c6.md:5`: "Aplicar JEF-V1 do contrato, salvo forma diversa no `perfil-estilo.md` do usuário".
- **R7** `jef-estilo/SKILL.md:8`: "Para inferir um perfil amplo, preferir 3 a 6 votos do usuário; com menos exemplos, declarar cobertura limitada, sem fabricar estilo nem bloquear produto judicial."
- **R8** `jef-director/references/profiles.md:3`: "Se não houver acesso, aplicar JEF-V1 e informar a limitação somente se material."

## Table

| Item | What N103 requires | Governing rule (file:line) | Class |
|---|---|---|---|
| RT103-b | Relatório hierarchy 1 to 2.3, then a fixed "Posição a ser adotada" block with 4 numbered options, then stop | Hierarchy: R2 (contrato.md:29). Stop and one question: R1 (contrato.md:9), R3 (c4.md:7), R4 (SKILL.md:8). Fixed block: R5 (c6.md:3) | Hierarchy and "one question, then wait": **requires**. Fixed named block with 4 options: **contradicts** R5 and R1 ("pergunta breve") |
| RT103-d | A reply that is not a choice ("pode seguir") keeps the pause | R1 (contrato.md:9) lifts the question only for "autonomia decisória expressamente concedida". R4 asks for "a escolha pendente". No rule covers a reply that is not a choice | **silent** (R4 implies a re-ask, but nothing says so) |
| RT103-f | 3 to 6 votos build a style profile; otherwise neutral JEF-V1 | R7 (jef-estilo/SKILL.md:8) for 3 to 6. R6 (c6.md:5) and R8 (profiles.md:3) for JEF-V1 as the fallback | 3 to 6: **requires**. Fewer than 3: **contradicts** (R7 says a limited-coverage profile with a declaration, N103 says neutral JEF-V1) |
| RT103-h | Director file about 400 words, Portuguese, names the Posição gate | `jef-director/SKILL.md` is 344 words (size met). The gate name appears nowhere; see RT103-b | Size: **requires**, met. Gate wording: follows the RT103-b decision (**contradicts** R5 if kept literal) |
| RT103-o | A reply "4" asks the user to write the position | No numbered menu exists in 1.2.0, so "4" has no meaning. R1 asks for a free "pergunta breve" | **silent**, and it exists only if the block in RT103-b exists |

None of the five rows is a plugin defect in the sense "a rule already requires it and the plugin breaks it". Where a rule requires it, the plugin text already states it. Three of the failures are limits of my check, not of the plugin:

1. RT103-b, h, o match the literal strings "Posição a ser adotada" and "pare". They score wording, not behavior.
2. RT103-f scans only `jef-voto`, `c6.md`, `profiles.md` and `contrato.md`. R7 sits in `jef-estilo/SKILL.md`, which the check does not read, and R7 has no "JEF-V1" in the same sentence. The item fails on a rule that exists. The check needs a scope fix in its own run, and the 1.2.0 baseline of 10 will move when it is fixed.
3. The two `check-error` cells on `lume-claude` are a guard assumption, not a product defect. `count_lume_open.py:16,43` and `lint_lume_plugin.py:16,97` read `ROOT/plugin.json`. The generated plugin has `.claude-plugin/plugin.json` by design (`plugins/scripts/build-lume-claude.mjs:128`), and the source has `plugin.json` and `.codex-plugin/plugin.json`. A guard that cannot read its target is not a guard. The fix is a manifest-path switch in the two scripts and a relock, in its own run, with no product edit.

## Decisions for Pedro

### D1. Does the relatório end with a fixed "Posição a ser adotada" block?

Texts in conflict:
- `jef-director/references/contrato.md:9`: "Relatório e minuta sem orientação exigem uma pergunta breve após o relatório".
- `jef-voto/references/c6.md:3`: "não impor seção de posição nem componentes não pedidos".
- N103 fixture: a named section 3 "Posição a ser adotada" with four numbered options, then a stop.

| Option | What changes in the rules | What the user reads in the relatório |
|---|---|---|
| A. Fixed block (N103 as built) | Rewrite R5 so it covers only the voto body. Name the block in R1 and extend R2 with a section 3. Predicates b, h and o become required. | After sections 1 and 2, a section "Posição a ser adotada" with options 1 to 3 (provimento, não provimento, parcial, each drafted from the autos) and option 4 (own position, to be written). Same menu every time. Risk: the plugin words possible outcomes itself, which sits next to R2 "Não recomendar resultado por iniciativa própria". |
| B. Keep 1.2.0 | No rule change. Retire b, h and o from the check, or reduce them to "one brief question and a wait". | The relatório ends with one short free-text question that the profile may shape. No numbered menu. The user types the position. |
| C. One-line question, no section | Add one sentence to R3: the question lists the outcomes the autos allow in one line, with no section heading and no numbering. | The relatório ends with a single sentence that names the available outcomes and asks which one to adopt. The user answers in words. |

Recommendation: B or C. Both keep R2 and R5 intact, and N103 intent (a stop, one question) is already required by R1, R3 and R4. Only A needs a rule rewrite that reverses R5. This is a product choice, so it stays with Pedro.

### D2. Does "pode seguir" count as express decision autonomy?

Texts: `contrato.md:9` lifts the question only for "autonomia decisória expressamente concedida". No rule covers a reply that does not choose.

| Option | User-visible result |
|---|---|
| Keep the pause (N103) | The user who writes "pode seguir" gets the same brief question again, and no voto is drafted until a position is given. |
| Treat it as autonomy | The plugin picks an outcome and drafts the voto. This moves the outcome decision to the plugin, against R2. |

Recommendation: keep the pause. One sentence in R3 would settle it. That edit is not in this run.

### D3. Fewer than 3 votos: neutral JEF-V1 or a limited-coverage profile?

Texts: `jef-estilo/SKILL.md:8` ("com menos exemplos, declarar cobertura limitada, sem fabricar estilo nem bloquear produto judicial") against the operator's stated rule (3 to 6 votos build a style profile, otherwise neutral JEF-V1).

| Option | User-visible result |
|---|---|
| Neutral JEF-V1 below 3 (N103 and the stated rule) | With 2 sample votos the minuta uses the plain JEF-V1 form and does not imitate them. |
| Limited-coverage profile (1.2.0) | With 2 sample votos the minuta imitates them where they cover the point, and the user is told the coverage is limited. |

Recommendation: neutral JEF-V1 below 3, because it matches the operator's own rule.

## Proof that no product file changed

Run after this note was committed:

    git diff --stat e63870c HEAD -- plugins
    git diff --name-only e63870c HEAD | grep -v '^audits/hillclimb/'

Both print nothing. `e63870c` is the PR #62 head. The branch adds only files under `audits/hillclimb/`.

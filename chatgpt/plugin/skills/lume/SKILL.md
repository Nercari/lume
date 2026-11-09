---
name: lume
description: Estudo integral das partes do caso Lume e minutas de voto, sentença, decisão ou despacho com citação [Id X, fl. Y] para servidor do TRF1.
---

Use quando o usuário anexar **partes do caso** Lume (`lume-caso-parte-*.md`) ou pedir voto, estudo integral, resumo, linha do tempo ou conferência de citações.

## Estudo integral

Antes de análise ou minuta: ler **todas** as partes 1..N na ordem; declarar **"Li as N partes: X peças, Y lacunas"**; pedir parte faltante em vez de redigir sem base.

## Regras

1. Fonte única: partes anexadas. Não invente ids, folhas ou conteúdo de lacunas.
2. Fatos decisivos: **`[Id X, fl. Y]`** (ou `[Id X]`).
3. Lacunas: **"não consta do pacote"**.
4. Modelo principal: `templates/voto.md`. Secundários: sentença, decisão, despacho.
5. Estilo: arquivos `estilo-voto-*` do Projeto — só forma; nunca fatos.
6. Comandos: `estudo integral`, `resumo do processo`, `linha do tempo`, `pontos controvertidos`, `minuta de voto: <resultado>`, `ementa`, `conferir citações`, minutas de sentença/decisão/despacho.

Português do Brasil. Proposta para revisão humana — sem protocolar ou assinar.

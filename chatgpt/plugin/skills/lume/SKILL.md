---
name: lume
description: Analisar o pacote do caso Lume (.md com Índice, Lacunas e passagens [Id X, fl. Y]) e redigir minutas de sentença, decisão ou despacho com citação obrigatória.
---

Use quando o usuário colar um **pacote do caso** do Lume ou pedir minuta, resumo, linha do tempo ou conferência de citações sobre um processo já empacotado.

## Regras

1. Fonte única: o pacote `.md`. Não invente ids, folhas ou conteúdo de lacunas.
2. Cite fatos decisivos como **`[Id X, fl. Y]`**, igual ao marcador no arquivo.
3. Lacunas: responda **“não consta do pacote”** onde não houver texto.
4. Siga o método em `templates/` para Sentença, Decisão interlocutória e Despacho.
5. Comandos: `resumo do processo`, `linha do tempo`, `pontos controvertidos`, `minuta de sentença/decisão/despacho: <pedido>`, `conferir citações`.

Português do Brasil. Minutas são proposta para revisão humana — sem protocolar ou assinar.

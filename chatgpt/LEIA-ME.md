# Lume no ChatGPT

O Lume monta um **pacote do caso** (`lume-pacote-do-caso.md`) no seu computador. Você usa o **seu** plano do ChatGPT, sem API paga do Lume.

## Opção 1 — Projeto no ChatGPT (recomendado)

1. Abra o **ChatGPT**.
2. **Projetos** → **Novo projeto** → nome **Lume**.
3. Em **Instruções**, cole **uma vez** todo o texto de `PROJETO-LUME.md` (nesta pasta). Salve.
4. A cada processo: no Lume, **Gerar pacote do caso** → **Baixar pacote do caso (.md)**. No projeto Lume, comece uma conversa, **anexe** o arquivo `.md` e peça resumo, linha do tempo ou minuta.

## Opção 2 — Plugin (se o seu plano oferecer)

1. Instale a pasta `plugin/` (manifesto Agent Plugin, com `skills/lume/`).
2. As regras de citação e os modelos de peça são os mesmos (`skills/lume/SKILL.md` e `skills/lume/templates/`).
3. O fluxo continua igual: gere o pacote no Lume e **anexe** o `.md` na conversa.

## O que não é necessário

- Não cole tokens, chaves de API nem senhas.
- O Lume não envia o processo a nenhum servidor; só vai ao ChatGPT o arquivo que você anexar.

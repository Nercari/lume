# Lume no ChatGPT

O Lume monta um **pacote do caso** no seu computador: um arquivo (`lume-pacote-do-caso.md`) ou, no caso grande, **partes** em ordem (`lume-caso-parte-01-de-NN.md`, …). Você usa o **seu** plano do ChatGPT, sem API paga do Lume. O **método de minuta** (instruções, contrato, módulos) é **seu** — não vem neste repositório.

## Opção 1 — Projeto no ChatGPT (recomendado)

1. Abra o **ChatGPT**.
2. **Projetos** → **Novo projeto** → nome **Lume**.
3. Mantenha **suas instruções** no Projeto como já usa hoje. Adicione o arquivo **`LUME-ADENDO.md`** (nesta pasta) aos arquivos do Projeto **ou** cole o texto ao **final** das suas instruções. Salve.
4. A cada processo: no Lume, **Gerar pacote do caso** (extensão) ou **Baixar pacote do caso (.md)**. No projeto Lume, comece uma conversa, **anexe todas** as partes e siga o adendo (leitura integral, listagem de IDs, lacunas).

## Opção 2 — Plugin (se o seu plano oferecer)

1. Instale a pasta `plugin/` (manifesto Agent Plugin, com `skills/lume/`).
2. As regras do pacote e os modelos de peça são os mesmos (`skills/lume/SKILL.md` e `skills/lume/templates/`).
3. O fluxo continua igual: gere o pacote no Lume e **anexe** o `.md` (ou todas as partes) na conversa.

## O que não é necessário

- Não cole tokens, chaves de API nem senhas.
- O Lume não envia o processo a nenhum servidor; só vai ao ChatGPT o que você anexar.

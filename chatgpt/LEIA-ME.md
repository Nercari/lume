# Lume no ChatGPT

O Lume prepara um **pacote do caso** (Markdown) no seu computador. Você usa o **seu** plano ChatGPT — sem API paga do Lume.

## Opção 1 — Projeto no ChatGPT (recomendado)

1. Abra **ChatGPT**.
2. Vá em **Projetos** → **Novo projeto** → nome **Lume**.
3. Em **Instruções**, cole **uma vez** o conteúdo de `PROJETO-LUME.md` (nesta pasta ou em `lume-install/chatgpt/`).
4. Salve.
5. No dia a dia: gere o pacote com a extensão (**Gerar pacote do caso**), cole o `.md` no chat do projeto Lume e peça resumo, linha do tempo ou minuta.

## Opção 2 — Plugin (se o plano oferecer)

1. Instale o plugin a partir da pasta `plugin/` (manifesto Agent Plugin, pasta `skills/lume/`).
2. As mesmas regras de citação e modelos de peça estão em `skills/lume/SKILL.md` e em `skills/lume/templates/`.
3. O fluxo continua: pacote local → colar no ChatGPT.

## O que não é necessário

- Não instale host nativo de mensagens nem cole tokens.
- Não cole tokens, chaves de API nem senhas.
- O pacote não envia o processo a servidores do Lume.

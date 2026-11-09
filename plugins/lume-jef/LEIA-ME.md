# Lume JEF — instalar no chat regular

Plugin só de skills (sem servidor, sem MCP, sem hooks). O método de relatório e minuta do JEF/TRF1 vai no chat regular do ChatGPT. O plugin não busca processo: o texto tem de chegar pelo Lume (vista do painel, pacote ou partes `lume-caso-parte-k-de-N.md`).

Fontes usadas em 2026-11-09:

- [Package your plugin](https://developers.openai.com/plugins/build/plugins.md) — manifesto portátil, skills, marketplace local e instalação manual.
- [Build skills](https://developers.openai.com/plugins/build/skills.md) — skill pode existir sem servidor MCP; `SKILL.md` curto e material longo em `references/`.
- [Upload and submit your plugin](https://developers.openai.com/plugins/deploy/submission.md) — ZIP no fluxo de publicação do diretório, não no chat do dia a dia.

## O ZIP

Na raiz do repositório:

```bash
node plugins/scripts/build-zip.mjs
```

Isso grava `plugins/dist/lume-jef-0.1.0.zip`. Dentro do ZIP, `plugin.json` fica na raiz, junto de `skills/` e `assets/logo.png`.

## Chat na web

O guia de empacotamento não descreve instalar um ZIP local no chat da web (chatgpt.com) arrastando o arquivo para a conversa. O passo "Upload plugin" do guia de submissão é o envio para revisão e publicação no diretório, por uma identidade de desenvolvedor verificada. Este repositório não faz esse envio.

Quem usa só o chat na web fica no caminho de Project, abaixo.

## App desktop — marketplace local

O mesmo guia de empacotamento diz para instalar e testar plugin local no app desktop do ChatGPT. A CLI só registra a fonte do marketplace.

Marketplace pessoal:

1. Descompacte o ZIP.
2. Copie a pasta do plugin para `~/.codex/plugins/lume-jef` (a pasta que contém `plugin.json`).
3. Crie ou edite `~/.agents/plugins/marketplace.json`. O exemplo do guia usa `source.path` começando com `./`, relativo à raiz do marketplace, com `policy.installation`, `policy.authentication` e `category`:

```json
{
  "name": "local-lume",
  "plugins": [
    {
      "name": "lume-jef",
      "source": {
        "source": "local",
        "path": "./.codex/plugins/lume-jef"
      },
      "policy": {
        "installation": "AVAILABLE",
        "authentication": "ON_INSTALL"
      },
      "category": "Productivity"
    }
  ]
}
```

4. Reinicie o app desktop do ChatGPT.
5. Abra o diretório de plugins, escolha essa fonte e instale **Lume JEF**.

O caminho `./.codex/plugins/lume-jef` segue o padrão que o guia chama de comum para instalação pessoal. Esta cópia do repositório não abriu o app desktop para confirmar a resolução.

Marketplace no clone do repositório: o exemplo do guia põe o catálogo em `$REPO_ROOT/.agents/plugins/marketplace.json` e o `source.path` em `./plugins/lume-jef`. Este repositório não versiona esse catálogo. Reinicie o app depois de criar o arquivo.

`codex plugin marketplace add` registra uma fonte. A instalação do plugin local continua no app desktop, como o guia descreve.

## Se a web não instalar o ZIP — Project

1. No ChatGPT: Projetos → Novo projeto → nome **Lume JEF**.
2. Nas instruções do projeto, mande seguir o skill `jef-director` e anexe os `SKILL.md` e as pastas `references/` de `plugins/lume-jef/skills/` (ou cole o texto desses arquivos).
3. A cada processo, anexe o pacote ou as partes. O modelo não busca o PJe.

## Uso

1. Instale o assistente Lume no Chrome.
2. Abra o processo.
3. No painel lateral, estude o processo e peça o relatório ou a minuta no chat em que este plugin (ou o Project) estiver ativo.

Um aviso de dado sensível pode aparecer. Ele não recusa o pedido.

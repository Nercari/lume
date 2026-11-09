# Lume — leia primeiro

Pacote do Lume para PJe (TRF1/SJDF) + ChatGPT. O passo a passo curto está em `COMECE-AQUI.txt`, na raiz do zip.

## O que vem neste pacote

- **extension/** — extensão do Chrome (carregar sem compactação).
- **extension/manual/** — página do pacote do caso (aberta pelo botão **Gerar pacote do caso** do painel).
- **chatgpt/** — `PROJETO-LUME.md` (instruções do Projeto no ChatGPT), `LEIA-ME.md` e `plugin/` (opcional).
- **guias/** — guias para usuários e TI.

## Instalar (uma vez)

1. Descompacte o zip numa pasta fixa, por exemplo `Documentos\Lume` (botão direito → Extrair tudo). Não apague essa pasta depois.
2. Chrome → `chrome://extensions` → ligue **Modo do desenvolvedor** → **Carregar sem compactação** → escolha a pasta `extension` deste zip.
3. Fixe o Lume no ícone de quebra-cabeça do Chrome.
4. ChatGPT → **Projetos** → **Novo projeto** "Lume" → **Instruções** → cole todo o texto de `chatgpt\PROJETO-LUME.md` → salve.

## A cada processo

| Etapa | Ação |
|-------|------|
| PJe | Pegue os autos: o PDF (Download dos autos, inclui páginas escaneadas via OCR local) ou o texto do PJe+R ("extrair autos em texto", sem imagens). |
| Lume | **Gerar pacote do caso** → escolha o PDF ou cole o texto → **Baixar pacote do caso (.md)**. |
| ChatGPT | No projeto Lume, comece uma conversa, **anexe** `lume-pacote-do-caso.md` e peça resumo, linha do tempo ou minuta. |
| Conferir | Cole a resposta em **Conferir citações**, na mesma página do Lume. |

## Desinstalar

Remova a extensão em `chrome://extensions` e apague a pasta onde descompactou o zip.

Não cole tokens nem chaves de API. O Lume não oferece fallback pago.

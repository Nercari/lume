# Lume — leia primeiro

Pacote para o Chrome e para um Projeto ChatGPT chamado Lume. Nada sai do computador além do que você envia no ChatGPT. Não há servidor.

## O que vem neste pacote

- **extension/** — extensão Chrome (carregar sem compactação).
- **extension/manual/** — página de fallback, se o estudo de um clique não servir.
- **chatgpt/** — `PROJETO-LUME.md` (instruções do Projeto) e `LEIA-ME.md`.
- **guias/** — este arquivo e o passo a passo.

## Instalação (uma vez)

1. Descompacte `lume-install` e, no Windows, execute `windows\instalar.ps1` (ou `instalar.bat`).
2. Chrome → `chrome://extensions` → Carregar sem compactação → pasta `extension`.
3. ChatGPT → Projetos → novo projeto **Lume** → cole o texto de `chatgpt\PROJETO-LUME.md` nas Instruções. O painel oficial, no chat normal, lê a aba do PJe.

Nao cole tokens nem chaves de API. O Lume nao oferece fallback pago.

## Cada processo

1. Abra o processo no PJe.
2. Clique **Estudar processo**.
3. Leia a aba do caso (`#lume-autos`) no painel do ChatGPT. **Salvar partes** e **Copiar parte k** ficam na página de estudo.

Se o painel disser que não achou a lista, use **Calibrar PJe** uma vez, salve `lume-calibracao.json` e envie esse arquivo ao Grok. Não é o texto do processo.

## Se o um clique não servir

**Gerar pacote do caso** abre a página do PDF. Baixe o processo no PJe (Download dos autos) e abra esse PDF ali. O arquivo `.md` pode ser anexado no mesmo Projeto.

## Desinstalar

- **Windows:** `windows\desinstalar.bat` remove `%LOCALAPPDATA%\Lume`.
- Remova a extensão em `chrome://extensions`.

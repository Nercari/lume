# Lume — leia primeiro

Pacote para o Chrome e para um Projeto ChatGPT chamado Lume. Nada sai do computador além do que você envia no ChatGPT. Não há servidor.

## O que vem neste pacote

- **extension/** — extensão Chrome (carregar sem compactação).
- **extension/manual/** — página de fallback, se o estudo de um clique não servir.
- **chatgpt/** — `PROJETO-LUME.md` (instruções do Projeto) e `LEIA-ME.md`.
- **guias/** — este arquivo e o passo a passo.

## Instalação (uma vez)

1. Descompacte o pacote `lume-install` se recebeu um ZIP.
2. No Windows, execute `windows\instalar.ps1` (ou `instalar.bat`).
3. Chrome → `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactação → pasta `extension`.
4. ChatGPT → Projetos → novo projeto **Lume** → cole o texto de `chatgpt\PROJETO-LUME.md` nas Instruções. O painel oficial do ChatGPT, no chat normal, lê a aba do PJe. A extensão não anexa arquivos.

Nao cole tokens nem chaves de API. O Lume nao oferece fallback pago.

## Cada processo

1. Entre no PJe no Chrome, como de costume, e abra o processo.
2. Clique no ícone da Lume. O painel abre ao lado.
3. Clique **Estudar processo**.
4. A Lume busca cada documento da linha do tempo, nessa ordem, na sessão já aberta e na memória. Texto nativo entra direto. PDF passa pelo leitor local. Página sem texto e imagem passam pelo OCR em português neste computador. Abre a mesma página do PJe com `#lume-autos`: o caso inteiro fica nessa aba para o painel do ChatGPT.
5. Na página de estudo, **Salvar partes** grava `lume-caso-parte-01-de-NN.md` e **Copiar parte k** copia essa parte. A Lume não abre o ChatGPT.

Se o painel disser que não achou a lista, use **Calibrar PJe** uma vez, salve `lume-calibracao.json` e envie esse arquivo ao Grok. Não é o texto do processo.

## Se o um clique não servir

**Gerar pacote do caso** abre a página do PDF. Baixe o processo no PJe (Download dos autos) e abra esse PDF ali. O arquivo `.md` pode ser anexado no mesmo Projeto.

## Desinstalar

- **Windows:** `windows\desinstalar.bat` remove `%LOCALAPPDATA%\Lume`.
- Remova a extensão em `chrome://extensions`.

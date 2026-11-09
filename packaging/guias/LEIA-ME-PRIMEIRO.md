# Lume — comece aqui (um minuto)

Part of #13. Guia rapido para servidoras e servidores do tribunal. **English summary at the end.**

## O que o Lume faz hoje

O Lume e uma extensao do Google Chrome que ajuda a ler o **inventario de documentos** de um processo aberto no PJe (TRF1 / SJDF) usando a sessao ja aberta no navegador. Voce pode:

- **Modo calibracao** — conferir se a leitura da lista esta correta e gerar um arquivo JSON de calibracao para enviar ao time tecnico (nao coloque dados pessoais de terceiros no e-mail sem autorizacao).
- **Modo PDF (“Download dos autos”)** — orientar a extrair texto de PDFs **que voce baixa manualmente** no PJe; o Lume nao envia o PDF para a internet sozinho.

O login opcional com ChatGPT (companion) so funciona se o Node.js estiver disponivel na estacao. **Sem Node, o modo manual (calibracao e copiar/colar no ChatGPT) continua.**

## Instalar no Windows (recomendado)

1. Descompacte o pacote `lume-install` se recebeu um ZIP.
2. Dê dois cliques em `windows\instalar.bat` (nao pede administrador).
3. Abra `chrome://extensions`, ative **Modo do desenvolvedor**, clique **Carregar sem compactacao** e escolha:
   - `%LOCALAPPDATA%\Lume\extension`
4. Fixe a extensao Lume na barra se quiser.

No macOS ou Linux, execute `macos/instalar.sh` ou `linux/instalar.sh` no terminal (instalacao so do seu usuario).

## Como usar a calibracao

1. Entre no PJe e abra o processo permitido.
2. Abra o painel lateral do Lume.
3. Siga as instrucoes na tela para o **modo calibracao**.
4. Quando o JSON estiver pronto, envie-o apenas pelos canais que seu setor autorizar (e-mail interno, chamado, etc.). **Nao cole tokens, senhas ou chaves de API.**

## Como usar com PDFs

1. Baixe o PDF pelo proprio PJe (“Download dos autos”), como voce ja faria sem o Lume.
2. Use o fluxo indicado no painel para extrair o texto **no seu computador**.
3. Se for usar ChatGPT, **cole voce mesma** o trecho no site; o Lume **nao envia** documentos para fora da maquina automaticamente.

## O que sai do computador

| Acao | Sai da maquina? |
|------|-----------------|
| Ler lista no PJe (extensao) | Nao — so le a pagina aberta |
| JSON de calibracao | So se **voce** enviar o arquivo |
| Texto para o ChatGPT | So se **voce** colar no navegador |
| Login ChatGPT (companion) | So com Node + voce iniciando login; tokens ficam locais (#5) |

Nada e enviado a servidores do Lume. Nao existe “plano pago” escondido nem pedido para colar token de API.

## Desinstalar

- **Windows:** `windows\desinstalar.bat` remove `%LOCALAPPDATA%\Lume` e o registro do companion.
- Depois remova a extensao em `chrome://extensions`.

## English (short)

Load unpacked from `%LOCALAPPDATA%\Lume\extension` after `instalar.bat`. Calibration exports JSON locally; PDF mode uses files you download yourself. Nothing leaves the PC unless you paste into ChatGPT or send files yourself. No API tokens. Uninstall with `desinstalar.bat`.

# Lume — leia primeiro

Pacote de instalacao offline para servidores da Justica Federal (PJe TRF1/SJDF + ChatGPT manual).

## O que vem neste pacote

- **extension/** — extensao Chrome (carregar sem compactacao).
- **manual/** — pagina para montar o pacote do caso a partir do PDF dos autos.
- **chatgpt/** — `PROJETO-LUME.md` (instrucoes do Projeto ChatGPT) e `LEIA-ME.md`.
- **guias/** — guias em portugues e ingles para TI e usuarios.

## Instalacao rapida (Windows)

1. Descompacte o pacote `lume-install` se recebeu um ZIP.
2. Execute `windows\instalar.ps1` (ou `instalar.bat`).
3. Chrome → `chrome://extensions` → Modo do desenvolvedor → Carregar sem compactacao → pasta `extension` dentro de `%LOCALAPPDATA%\Lume`.
4. ChatGPT → Projetos → novo projeto **Lume** → cole `chatgpt\PROJETO-LUME.md` nas Instrucoes.

## Uso

| Etapa | Acao |
|-------|------|
| PJe | Abra o processo logado no Chrome. |
| Painel Lume | **Gerar pacote do caso** abre a pagina manual; baixe o PDF no PJe se ainda nao tiver. |
| ChatGPT | Cole o `.md` no projeto Lume e peça minuta ou analise. |

## Desinstalar

- **Windows:** `windows\desinstalar.bat` remove `%LOCALAPPDATA%\Lume`.
- Remova a extensao em `chrome://extensions`.

Nao cole tokens nem chaves de API. O Lume nao oferece fallback pago.

# Lume installation guide (staff)

Lume helps you read a PJe case in Chrome and work in **your own ChatGPT plan**. Lume does **not** offer a paid API key. Never paste tokens.

## Before you start

- You need permission to work on the case in PJe with your normal login.
- You need the ChatGPT desktop app, or a ChatGPT Project if that app is not available.
- Get the `lume-install-windows` zip from the maintainer, not a random download.

## Install the extension

Carregue a pasta `extension` e instale o plugin no passo 1 do fluxo abaixo. A pasta do zip precisa continuar no disco.

## Set up ChatGPT

O app desktop recebe "Lume JEF" por `plugin\lume-jef\instalar\instalar-plugin.cmd`. Sem esse app, use a pasta do Projeto indicada depois dos três passos.

## Daily workflow

1. Instale: no Chrome, carregue a pasta extension (chrome://extensions > Modo do desenvolvedor > Carregar sem compactação); depois dê dois cliques em plugin\lume-jef\instalar\instalar-plugin.cmd, reinicie o app ChatGPT e instale "Lume JEF" em Plugins > Lume.
2. No PJe, abra o processo e clique "Lume: Estudar processo" (ou peça no Work: "prepare este processo com o Lume"). Espere o título da aba "Lume: pronto".
3. No ChatGPT (painel lateral nessa aba, chat normal), peça o relatório ou a minuta. Caso grande: anexe as partes salvas.

Plano B: clique você no botão Lume: Estudar processo na página do processo. A aba e os próximos passos são os mesmos.
Sem o app desktop: use a pasta plugin\lume-jef-projeto num Projeto (instruções em COLE-NO-PROJETO.md).
Se o painel não achar a lista, use Calibrar PJe, salve lume-calibracao.json e envie o arquivo ao mantenedor.
Nada além do ChatGPT sai do computador.

## Update Lume

- Unzip the new package over the same folder (or IT provides a managed update).
- Reload the unpacked extension or let policy refresh the CRX.
- Run `plugin\lume-jef\instalar\instalar-plugin.cmd` again and restart the ChatGPT app.

## Remove case data

- The one-click study does not write the case to disk unless you click **Salvar partes**.
- Delete any saved `.md` parts and PDFs according to your court’s file policy.
- **Carregar perfil** stores only a selector profile, not case text.

## Uninstall Lume

- Remove the extension in `chrome://extensions`.
- Run `windows\desinstalar.bat` or delete the folder where you unzipped Lume (`%LOCALAPPDATA%\Lume` on Windows).
- Remove the ChatGPT plugin or Project you no longer need (your ChatGPT account settings).

## Troubleshooting

| Symptom | What to try |
|--------|----------------|
| Panel says it cannot find the document list | Open **Calibrar PJe** on the case, click **Salvar calibração**, and send `lume-calibracao.json` to the maintainer. The file has no case text. |
| Plugin does not appear on the web | Use `plugin\lume-jef-projeto` in a Project and follow `COLE-NO-PROJETO.md`. |
| Tab title never says ready | Use Plano B: click **Lume: Estudar processo** yourself on the case page. |
| The side panel does not show the case | Stay on the PJe tab whose address ends in `#lume-autos`. Use **Parte seguinte** for the next part, or **Copiar parte k** / **Salvar partes** on the study page. |

For permissions and limits, see `permissions-and-limits.md`.

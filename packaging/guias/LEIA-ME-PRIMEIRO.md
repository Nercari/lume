# Lume — leia primeiro

Pacote do Lume para PJe (TRF1/SJDF) + ChatGPT. O passo a passo curto está em `guias\COMECE-AQUI.txt`.

## O que vem neste pacote

- **extension/** — extensão do Chrome (carregar sem compactação).
- **plugin/lume-jef/** — plugin "Lume JEF", com `instalar\instalar-plugin.cmd` e `instalar-plugin.ps1`.
- **plugin/lume-jef-0.2.0.zip** — o mesmo plugin compactado.
- **plugin/lume-jef-projeto/** — fallback de Projeto na web (`COLE-NO-PROJETO.md`).
- **guias/** — guias para usuários e TI.

## Instalar e usar

Descompacte o zip numa pasta fixa, por exemplo `Documentos\Lume` (botão direito → Extrair tudo). Não apague essa pasta depois.

1. Instale a extensão: no Chrome, carregue a pasta extension (chrome://extensions > Modo do desenvolvedor > Carregar sem compactação). O plugin é opcional: dois cliques em plugin\lume-jef\instalar\instalar-plugin.cmd, reinicie o app ChatGPT e instale "Lume JEF" em Plugins > Lume.
2. No painel do Lume, clique "Entrar com ChatGPT" uma vez e aprove.
3. No processo do PJe, clique "Lume: Estudar processo" e depois "Gerar relatório e minuta".

Plano B: sem entrar ou sem cota, use a aba do caso no painel lateral do ChatGPT com o plugin Lume JEF.
Sem o app desktop: use a pasta plugin\lume-jef-projeto num Projeto (instruções em COLE-NO-PROJETO.md).
Se o painel não achar a lista, use Calibrar PJe, salve lume-calibracao.json e envie o arquivo ao mantenedor.
Nada além do ChatGPT sai do computador.

## Desinstalar

- **Windows:** `windows\desinstalar.bat` remove `%LOCALAPPDATA%\Lume`.
- Remova a extensão em `chrome://extensions` e apague a pasta onde descompactou o zip.

Não cole tokens nem chaves de API. O Lume não oferece fallback pago.

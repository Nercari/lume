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

1. Instale: no Chrome, carregue a pasta extension (chrome://extensions > Modo do desenvolvedor > Carregar sem compactação); depois dê dois cliques em plugin\lume-jef\instalar\instalar-plugin.cmd, reinicie o app ChatGPT e instale "Lume JEF" em Plugins > Lume.
2. No PJe, abra o processo e clique "Lume: Estudar processo" (ou peça no Work: "prepare este processo com o Lume"). Espere o título da aba "Lume: pronto".
3. No ChatGPT (painel lateral nessa aba, chat normal), peça o relatório ou a minuta. Caso grande: anexe as partes salvas.

Plano B: clique você no botão Lume: Estudar processo na página do processo. A aba e os próximos passos são os mesmos.
Sem o app desktop: use a pasta plugin\lume-jef-projeto num Projeto (instruções em COLE-NO-PROJETO.md).
Se a página não for reconhecida, use o Modo calibração e envie o JSON ao mantenedor.
Nada além do ChatGPT sai do computador.

## Desinstalar

Remova a extensão em `chrome://extensions` e apague a pasta onde descompactou o zip.

Não cole tokens nem chaves de API. O Lume não oferece fallback pago.

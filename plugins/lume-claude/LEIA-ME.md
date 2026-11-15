# Lume para Claude

Adaptação do plugin Lume (skills, sem MCP) para o Claude. Skills, referências e scripts vêm do plugin `lume-workspace` sem mudança, exceto o carregamento de módulos e os caminhos (veja `plugins/scripts/build-lume-claude.mjs`). Cada skill é autossuficiente: leva na própria pasta os módulos que cita, com caminhos relativos ao SKILL.md, sem variáveis `${CLAUDE_*}`. Versão do manifesto: 1.2.0.

Uso: cole ou anexe as peças no chat e peça o produto: triagem, relatório, minuta, pesquisa ou revisão. Após o relatório, o Lume pergunta a posição a ser adotada e só então redige a minuta, salvo se o pedido já indicar a orientação. Para configurar o estilo, envie de 3 a 6 votos de sua autoria. Sem perfil, o Lume usa JEF-V1.

Testar sem instalar: `claude --plugin-dir plugins/lume-claude`. Skills: `/lume:jef-director`, `/lume:jef-triagem` e as demais.

Não usa servidor, MCP, hooks nem `bin/`. Os scripts de `skills/jef-director/scripts/` rodam localmente, sem rede; `extract_pdf.py` exige pypdf, e OCR exige pdftoppm e tesseract.

---
name: jef-pacote
description: "Lê documentos enviados ou acessíveis por ferramentas autorizadas, com extração de texto, OCR, mapa de páginas e lacunas."
---

# Leitura documental

Leia o jef-director primeiro. Identifique o conjunto efetivamente disponível, processo e peças indispensáveis. Use arquivos e conectores autorizados; o plugin não cria acesso a PJe. Pedido para ler aba existente usa ferramenta de navegador disponível e suas regras, sem afirmar que o Lume possui API do tribunal.

Leia as partes e confira índice/cobertura. IDs, páginas do documento e páginas do PDF são distintos. Não invente localizadores. Documento ou parte ausente bloqueia só etapa materialmente dependente.

Texto nativo é a primeira extração; OCR é permitido para imagem, página vazia ou texto corrompido. Preserve o arquivo original, hash, método e número físico de cada página. Confira visualmente no original nomes, datas, valores e trechos decisivos quando extraídos de imagem ou duvidosos. OCR não comprova leitura, autenticidade ou suficiência; lacuna permanece lacuna. Não substituir silenciosamente idioma ausente. Leitura por visão é alternativa suportada, sem alegar execução de OCR.

Com executor local, o extrator opcional está em `scripts/extract_pdf.py`; leia `references/tools.md`. Ferramentas nativas do host também servem. Não exigir instalação adicional se a leitura suportada já bastar.

Em inteiro teor TXT/MD, detectar cabeçalhos `## Documento <id> — <título>`, construir índice, preservar ID de origem e documento, ler integralmente peças decisivas e verificar atos posteriores pertinentes. A citação visível obedece ao contrato do produto, não regra global de exibir dois IDs.

Pacotes lume-caso/1 seguem `references/formato.md`. Caso avulso não exige esse formato. Nenhum nome de arquivo de teste altera o método de leitura.

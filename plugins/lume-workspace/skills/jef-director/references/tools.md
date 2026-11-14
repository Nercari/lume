# Ferramentas locais opcionais

Resolver o diretório real desta skill via ambiente. Scripts ficam em `../scripts/` relativamente a esta referência. Com fonte cloud sem arquivos locais, recuperar os arquivos do pacote pelo mecanismo suportado; não inventar caminho. Sem executor, usar ferramentas nativas ou conferência manual e não alegar execução. Não expor dados processuais em logs compartilhados.

## Extração

`python extract_pdf.py INPUT.pdf --output NOVO.json --language por`

Requer Python, pypdf; OCR requer pdftoppm, tesseract e idioma solicitado. Não instala dependências nem faz rede. Usa texto nativo e OCR por página quando pouco texto, caractere inválido ou página forçada com `--ocr-pages 2,4`. A heurística não detecta todo texto defeituoso nem texto rasterizado em página mista: inspecionar original e forçar páginas necessárias. Saída preserva hash, número físico, método, idioma, texto, lacuna e review_required. Não cria página interna nem ID. Código 0: extração produzida; 2: lacunas; 1: falha. Idioma ausente é lacuna explícita, nunca troca automática para inglês. Conferir trechos decisivos na imagem original.

## Conferências

`python lume_check.py package INPUT.json`

Entrada: documents [{id: string, status: lido|parcial|ilegível|ausente|falhou|restrito, gaps: lista}], total_parts: inteiro, parts [{number: inteiro, ids: lista}]. Exige cobertura exata, unicidade e status/lacuna coerentes. PASS é integridade do inventário declarado, não leitura do conteúdo. Falha por parte ausente orienta delimitação da dependência, não bloqueio de todas as tarefas.

`python lume_check.py locators INPUT.json`

Entrada: documents [{id, pages: [{pdf_page, document_page quando conhecida, text}]}], references [{id, pdf_page e/ou document_page se conhecidos, quote opcional}]. ID é string. Página é inteiro positivo. Citação é conferida literalmente numa página selecionada. Sem página, busca no documento. Não estima mapeamento nem valida afirmação jurídica. A ausência de quote não comprova conteúdo.

`python lume_check.py diff INPUT.json`

Entrada: base, candidate (minutas completas), editable_items (lista de números), edit_ementa (booleano opcional), protected e removed (listas de trechos literais). Formato aceito: parágrafos `**1.**`. Comparação ignora só espaços externos aos blocos. Rejeita estrutura alterada e conteúdo fora dos itens autorizados. Reordenação/renumeração e formato pessoal diverso exigem comparação própria, não PASS fictício. Não mede melhora de estilo nem adequação de parágrafos.

`python lume_check.py checkpoint INPUT.json --output STATE.json --expected-version N`

Schema e fluxo em checkpoint.md. N=0 para arquivo inexistente. Exige case_id igual e incremento unitário, trava local exclusiva e substituição atômica. Não reutilizar o mesmo destino para outro caso. Persistência remota exige conector e controle de versão próprios. Validar fontes novamente ao retomar.

Todos os checks emitem JSON PASS/FAIL e código 0/1. Não emitir certificação jurídica a partir de PASS. Conferência de ementas, autonomia de parágrafos e cobertura de questões é semântica, conforme módulos próprios.

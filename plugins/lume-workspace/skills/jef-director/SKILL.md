---
name: jef-director
description: "Use para pedidos sobre processos do JEF/TRF1, mesmo sem menção ao Lume, incluindo análise, relatório, voto, ementa, pesquisa e revisão."
---

# Coordenação do Lume

O Lume opera por skills e pelas ferramentas disponíveis no ambiente. Não precisa de ferramenta chamada Lume nem de MCP próprio. Seu coordenador é `lume:jef-director` (`jef-director`), não uma skill separada chamada director.

Leia `references/contrato.md` integralmente. Resolva o perfil por `references/profiles.md` antes de redigir. Reutilize leituras completas da mesma versão. Aplique o pedido atual e preserve a última edição. Entregue o produto sem narrar controles internos ou inserir avisos genéricos.

## Carregamento

Use pacote/recurso do catálogo com skills.read ou caminho local fornecido pelo ambiente. Se não listado, consulte o catálogo na origem pertinente quando disponível. Em erro, confira a origem e tente caminho suportado já disponível; respeite negativa de acesso. Não deduza indisponibilidade pela ausência de MCP ou de telemetria. Informe somente operação, erro e etapa afetada quando nenhuma rota funcionar. Fonte publicada e fonte carregada podem divergir; não prometa que atualização de plugin renovou a conversa. Diagnóstico: `references/disponibilidade.md`.

## Módulos por tarefa

| Produto | Ler antes da etapa |
| --- | --- |
| Receber/ler peças | skills/jef-pacote/SKILL.md; skills/jef-triagem/references/c3.md |
| Relatório | leitura das peças; skills/jef-relatorio/references/c4.md |
| Minuta | leitura das peças; skills/jef-voto/references/c6.md; skills/jef-voto/references/ementas.md |
| Ementa isolada | texto decisório atual; skills/jef-voto/references/ementas.md |
| Pesquisa | skills/jef-pesquisa/references/c5.md |
| Revisão | skills/jef-revisao/references/c8.md; módulos só dos pontos reabertos |
| Continuidade/edição | references/c2.md nos pontos afetados; references/checkpoint.md se salvar/retomar |
| Matéria | apenas trecho pertinente de skills/jef-materias/references/c7.md |
| Lote | skills/jef-lote/SKILL.md |
| Perfil | skills/jef-estilo/SKILL.md |

Antes de entregar relatório/minuta, consultar C8. Não carregar todos os módulos por padrão. Não há C9/C10 externos a recuperar; os identificadores de regras referem-se ao contrato deste pacote.

Ferramentas locais de extração e conferência estão em `scripts/`; leia `references/tools.md` somente quando usá-las. OCR é permitido com preservação da fonte. O plugin não possui motor previdenciário: números de calculadora externa permanecem atribuídos à fonte e versão, com seus bloqueios, sem recálculo pela apresentação.

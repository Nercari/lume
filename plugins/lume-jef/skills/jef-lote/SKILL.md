---
name: jef-lote
description: >-
  Lote de processos que o Lume já reuniu. Trata um caso isolado por vez,
  começando em 5, sem carregar fato de um processo para outro.
---

# Lote

Use somente quando o usuário já tiver os casos: vários pacotes ou partes anexados, ou a lista que ele cola um a um. A busca é do jef-work ou do botão.

- Um caso por vez, isolado. Comece com 5 por leva. Se houver mais, a próxima leva só começa depois da tabela da leva atual.
- CASE_STATE novo em cada caso. Nenhum fato, nome, resultado, exceção ou localizador passa para o seguinte.
- Em cada caso, leia o pacote com o skill jef-pacote e entregue o produto pedido, relatório ou minuta.
- Ao fim da leva, entregue uma tabela com as colunas caso, peças lidas, lacunas, produto e pendências.

Não misture peças de casos diferentes na mesma minuta.

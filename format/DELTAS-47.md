# Deltas do botão (`lume/47-one-click`) para `lume-caso/1`

Lido em `origin/lume/47-one-click` (somente leitura). A SPEC em `format/SPEC.md` vale. Este arquivo é a lista que o job do botão aplica. Não muda `extension/**` nem `manual/**` neste PR.

Os exemplos abaixo usam ids sintéticos. O branch citado usa os mesmos ids de teste (`DOC1`, `DOC2`).

## 1. DOM da vista

Hoje, `extension/src/content.js` (`paintCaseView`) troca o `body` por um `<p>` sem id (links “Parte anterior” / “Parte seguinte”, botão `#lume-copiar`) e um `<pre id="lume-caso">` sem `data-*`. Não há `data-formato`, `data-origem`, `data-parte`, `data-total` nem `<header>`.

Aplicar o artigo da SPEC: `article#lume-caso` com `data-formato="lume-caso/1"`, `data-origem`, `data-parte`, `data-total`, `<header>` com `data-campo` `processo`, `orgao`, `gerado-em`, `origem`, `contagens`, e `<pre data-lume-texto>`. Manter `#lume-copiar` e as hash `#lume-autos` e `#lume-autos/k`.

## 2. Marcador de versão

A vista e o arquivo não carregam `lume-caso/1`. O `caseResult.version` em `extension/src/assemble.js` é `'1'`, outro campo.

Aplicar: primeira linha do corpo `lume-caso/1`, front-matter `formato: lume-caso/1`, `data-formato="lume-caso/1"`.

## 3. Cabeçalho

`renderCaseParts` (`extension/src/case-view.js`) começa em `Parte k de N`. Não emite processo, órgão, gerado em, origem nem contagens. `caseResult.origin` é `'pje'`, não `botao`.

Aplicar o bloco de cabeçalho da SPEC em toda parte. Neste botão, `origem` é `botao`.

## 4. Índice

Cabeçalho atual: `ID | Tipo | Data | Págs. | Situação`. A célula Págs. é a quantidade de registros de página (`pages.length`), ou `—`.

Aplicar: `ID | Tipo | Data | Págs. do documento | Situação`. A célula lista as páginas do documento conhecidas (`1`, `1, 3`, `1-3`) ou `—`. Não publicar a contagem nesse lugar.

O índice e as lacunas já ficam só na parte 1 da vista. Manter isso. Acrescentar, em toda parte, a linha `Ids:` com os ids daquela parte.

## 5. Etiquetas

`passageTag` em `case-view.js`:

- página do documento e página do PDF diferentes: `[ID X, pág. documento Y, pág. PDF Z]`
- as duas presentes e iguais, ou só a do documento: `[ID X, pág. Y]`
- só a do PDF: `[ID X, pág. PDF Z]`
- nenhuma: `[ID X]`

Aplicar: sem página conhecida, a etiqueta é `[ID X]` e o trecho continua texto. Exportação de texto do PJe+R e vista HTML nativa muitas vezes não têm localizador; isso não vira lacuna. `[ID X, pág. Y]` é a página do documento. `pág. PDF Z` entra só quando a página do PDF é conhecida. Se as duas existem, `[ID X, pág. Y, pág. PDF Z]`, mesmo quando os números coincidem. `pág.` sem a palavra `documento` é a página do documento. Não estimar página.

## 6. Arquivos de parte

`extension/src/pack-bridge.js` chama `buildCasePack` (`manual/src/pack.js`) e grava sempre `lume-caso-parte-01-de-01.md`. `PART_MAX_CHARS` (350000) corta a vista (`renderCaseParts`) e não corta o arquivo. `buildCasePackParts` não existe neste checkout.

O arquivo atual não tem front-matter. O miolo é o pacote antigo:

- prosa de instrução no topo
- `## Índice das peças` com tabela `| Id | tipo | título | fls. | páginas do PDF | OCR? |`
- `## Lacunas` e `## Texto`
- etiqueta `[Id X, fl. Y]`

`sheetNumber` (`manual/src/sheets.js`) preenche a folha com o índice 1-based da página dentro do documento quando `pageInDoc` é nulo. Isso estima localizador. A SPEC proíbe.

Aplicar: um arquivo por parte, nome `lume-caso-parte-kk-de-NN.md`, front-matter da SPEC, o mesmo corpo da vista, corte de 350000 caracteres por arquivo (um trecho sozinho pode ultrapassar; não cortar no meio). Não usar `fl.` nem estimar página.

## 7. Lacunas

A vista lista `- Id X, pág. …, <detalhe livre>` (`gapLines`). O pacote lista `Id`, `fl.` e `página do PDF`, com motivos internos `unreadable_page`, `corrupt_file`, `image_no_text`, `empty_text` filtrados em `pack.js`. Detalhe livre (`ilegível`, `video/mp4`).

Aplicar linhas `- ID <id>, pág. <n>, pág. PDF <m>: <motivo>` com motivo só `imagem_sem_texto`, `ilegivel`, `binario` ou `falha_busca`. Mapa sugerido, sem inventar página:

| Situação hoje | Motivo |
| --- | --- |
| página de imagem sem texto | `imagem_sem_texto` |
| página sem texto legível (`ilegível`) | `ilegivel` |
| tipo não suportado / arquivo corrompido (`corrupt_file`, `unsupported`) | `binario` |
| id da lista que não voltou, falha de busca, restrito, ausente | `falha_busca` |

`restrito`, `ausente`, `falhou`, `ilegível` e `parcial` continuam na coluna Situação. Situação diferente de `lido` exige lacuna.

## 8. Cópia integral

`allText` troca a primeira linha `Parte 1 de 1` por `Caso completo`.

Aplicar: `#lume-copiar` concatena os corpos na ordem, cada um com o próprio `Parte k de N` e o marcador `lume-caso/1`. Sem o título `Caso completo`.

## 9. Sidecar

Não há `lume-caso.json`.

Aplicar o sidecar opcional da SPEC. `ocr: local` quando esta extensão rodou OCR; `ocr: nenhum` quando não rodou. `visao` não é deste botão.

## 10. O que já fecha e permanece

- Ordem dos documentos: a ordem da linha do tempo já usada em `renderCaseParts` (o índice não reordena por data).
- Três números já separados na vista quando a página do documento falta: `pageInDoc` nulo não vira página do documento em `passageTag`.
- Situações `restrito`, `ausente`, `falhou`, `ilegível`, `parcial`, `lido`.
- Hash `#lume-autos` e `#lume-autos/k`.
- Constante 350000 já definida em `pack-bridge.js`. Falta usá-la nos arquivos, não só na vista.

## 11. Título da aba

A vista não define `document.title`.

Aplicar, com a parte k visível: `Lume: pronto · N docs · L lacunas · parte k de T`. Na abertura, k é 1: `Lume: pronto · N docs · L lacunas · parte 1 de T`. Se o estudo falha, o título começa com `Lume: falhou`.

`#lume-estudar` não é deste botão. É o controle na página pelo qual o modo Work (`origem: work`) abre a mesma aba `#lume-autos`. O contrato da aba, inclusive o título, é o mesmo dos dois.

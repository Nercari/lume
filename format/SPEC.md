# Formato de caso Lume v1 (`lume-caso/1`)

## English summary

Shared case package emitted by the Lume button (`origem: botao`) and by the ChatGPT Work skill (`origem: work`). The two origins are identical: same `#lume-autos` tab, same DOM, same body, same title. Work opens that tab by clicking the in-page button `#lume-estudar`. The ready title is `Lume: pronto · N docs · L lacunas · parte 1 de T`; a failure title starts `Lume: falhou`. One browser view and the part files `lume-caso-parte-kk-de-NN.md` carry the same body. Part 1 holds the master index and the gap list. Passages use `[ID X]` when no page is known (still text, not a gap), `[ID X, pág. Y]` for a document page, and `pág. PDF Z` only when a PDF page is known. The three locators (document id, document page, PDF page) stay distinct and are never estimated. Parts split near 350000 characters. Order is the PJe timeline. An optional `lume-caso.json` sidecar repeats documents, parts, and gaps for a machine check. Normative text below is Portuguese.

## 1. Escopo

Este arquivo é o contrato. O botão (hoje o branch `lume/47-one-click`) e o modo Work emitem este formato. As skills `jef-*` leem um só formato nos dois caminhos. Onde o emissor atual divergir, vale esta SPEC. Os ajustes do botão estão em `format/DELTAS-47.md`.

Não há número de processo, nome de parte nem dado pessoal neste texto. Os exemplos usam fichas sintéticas (`PROC-SYN-1`, `ORGAO-SYN`, `D1`).

## 2. Vista de uma aba

A página do processo, com a hash `#lume-autos` (parte 1) ou `#lume-autos/k` (parte k), mostra o caso no lugar da lista. `origem: work` é idêntica a `origem: botao`: o mesmo DOM, o mesmo corpo, o mesmo título. O modo Work chega nessa aba ao clicar o botão na página `#lume-estudar`. O botão da extensão continua abrindo a mesma aba com `origem: botao`.

O título da aba faz parte do contrato:

- Pronta, na parte 1: `Lume: pronto · N docs · L lacunas · parte 1 de T`. N é o número de documentos do índice, L é o número de lacunas, T é o total de partes.
- Ao mostrar a parte k, só muda o número da parte: `Lume: pronto · N docs · L lacunas · parte k de T`.
- Falha, sem caso para ler: o título começa com `Lume: falhou`. O restante é um motivo curto, sem texto de peça.

O DOM estável é:

```html
<article id="lume-caso" data-formato="lume-caso/1" data-origem="botao" data-parte="1" data-total="2">
  <header>
    <p data-campo="processo">PROC-SYN-1</p>
    <p data-campo="orgao">ORGAO-SYN</p>
    <p data-campo="gerado-em">2026-01-15T12:00:00Z</p>
    <p data-campo="origem">botao</p>
    <p data-campo="contagens">3 documentos, 2 trechos, 2 lacunas</p>
  </header>
  <p>
    <a href="#lume-autos">Parte anterior</a>
    <a href="#lume-autos/2">Parte seguinte</a>
    <button type="button" id="lume-copiar">Copiar tudo</button>
  </p>
  <pre data-lume-texto>…corpo da parte k…</pre>
</article>
```

- `data-formato` é sempre `lume-caso/1`.
- `data-origem` é `botao` ou `work`.
- `data-parte` e `data-total` são inteiros, `data-parte` de 1 até `data-total`.
- `data-campo="contagens"` repete as três contagens do caso, sem o prefixo `Contagens:`.
- O botão `#lume-copiar` copia, em ordem, o corpo de cada parte separado por uma linha em branco. Cada parte continua com o próprio `Parte k de N`. Não há título substituto.
- O texto de `<pre data-lume-texto>` é o corpo definido na seção 4, sem o front-matter YAML.

## 3. Arquivos de parte

Nome: `lume-caso-parte-kk-de-NN.md`. `kk` e `NN` usam a mesma largura, no mínimo dois dígitos (`01`, `02`; a partir de 100, três dígitos). N é o total. As partes 1..N existem todas. Não há outro nome de pacote neste contrato.

Front-matter, chaves nesta ordem, valores escalares:

```yaml
---
formato: lume-caso/1
processo: PROC-SYN-1
parte: 1
total: 2
ids: D1
origem: botao
---
```

- `formato` é `lume-caso/1`.
- `processo` é o identificador que o PJe mostrou, ou `—` se o emissor não o tiver. Uma linha, sem pipe.
- `parte` e `total` são inteiros sem zero à esquerda e batem com o nome do arquivo.
- `ids` são os ids desta parte, separados por vírgula, na ordem do índice. O mesmo id não se repete.
- `origem` é `botao` ou `work`.

O corpo que segue o front-matter é o mesmo corpo da vista.

## 4. Corpo

Toda parte, vista ou arquivo:

```
lume-caso/1
Processo: PROC-SYN-1
Órgão: ORGAO-SYN
Gerado em: 2026-01-15T12:00:00Z
Origem: botao
Contagens: 3 documentos, 2 trechos, 2 lacunas

Parte 1 de 2
Ids: D1
```

- A primeira linha é o marcador `lume-caso/1`.
- `Gerado em` é UTC, `AAAA-MM-DDTHH:MM:SSZ`.
- As palavras `documentos`, `trechos` e `lacunas` ficam no plural mesmo quando a conta é 1.
- As contagens são do caso inteiro: documentos no índice, trechos etiquetados em todas as partes, linhas de lacuna. Repetem-se em cada parte.
- `Parte k de N` bate com `parte` e `total`.
- `Ids:` repete o front-matter `ids`, na mesma ordem. Ids sem espaço interno. Vazio não ocorre: uma parte existe porque tem ao menos um id.

Só a parte 1 continua com o índice mestre e as lacunas. As outras partes seguem direto para os trechos. Não repetem `Índice` nem `Lacunas`.

```
Índice
ID | Tipo | Data | Págs. do documento | Situação
D1 | petição inicial | 2020-02-02 | 1 | lido
D2 | laudo | 2020-03-03 | 1-2 | parcial
D3 | outros | — | — | ausente

Lacunas
- ID D2, pág. 2: ilegivel
- ID D3: falha_busca
```

Colunas, separadas por ` | ` (espaço, pipe, espaço):

| Coluna | Valor |
| --- | --- |
| ID | Id estável da peça no PJe. Não é a página. |
| Tipo | Um rótulo da taxonomia já usada pelo classificador: `petição inicial`, `contestação`, `réplica`, `decisão`, `despacho`, `sentença`, `ato ordinatório`, `certidão`, `procuração`, `documento de identificação`, `laudo`, `ofício`, `manifestação`, `recurso/apelação`, `embargos`, `intimação/citação`, `outros`. |
| Data | `AAAA-MM-DD` ou `—`. Não se inventa data. |
| Págs. do documento | Páginas do documento conhecidas: `1`, `1, 3` ou intervalo inclusivo `1-3`. `—` quando nenhuma página do documento é conhecida. O texto da peça pode existir mesmo assim. Não é a quantidade de páginas. Não é a página do PDF. Não se completa um intervalo com página não vista. |
| Situação | `lido`, `parcial`, `ilegível`, `ausente`, `falhou`, `restrito`. |

`lido`: todo o texto visto está legível; há ao menos um trecho; não há lacuna desse id. `parcial`: há trecho e há lacuna. `ilegível`, `ausente`, `falhou`, `restrito`: não há trecho; há ao menos uma lacuna.

Lacunas, uma por linha, ou a única linha `- nenhuma`:

```
- ID <id>: <motivo>
- ID <id>, pág. <n>: <motivo>
- ID <id>, pág. PDF <m>: <motivo>
- ID <id>, pág. <n>, pág. PDF <m>: <motivo>
```

`<n>` e `<m>` são inteiros positivos, sem zero à esquerda. `<motivo>` é um destes códigos: `imagem_sem_texto`, `ilegivel`, `binario`, `falha_busca`. A situação `ilegível` (com acento) não substitui o código `ilegivel`.

Trechos, depois das lacunas na parte 1 e depois de `Ids:` nas demais:

```
[ID D1, pág. 1, pág. PDF 1]
texto do trecho

[ID D2, pág. 1, pág. PDF 4]
texto do trecho
```

Gramática da etiqueta, uma linha:

- `[ID <id>]` — nenhuma página conhecida. O trecho continua texto. Exportação de texto do PJe+R e vista HTML nativa costumam chegar assim. Não viram lacuna e não recebem página estimada.
- `[ID <id>, pág. <n>]` — página do documento. Sem `pág. PDF` quando a página do PDF não é conhecida.
- `[ID <id>, pág. PDF <m>]` — só a página do PDF. Não se inventa a página do documento.
- `[ID <id>, pág. <n>, pág. PDF <m>]` — as duas são conhecidas, mesmo se `<n>` for igual a `<m>`. `pág. PDF` só entra nesse caso, ou no caso em que só o PDF é conhecido.

O texto do trecho vem nas linhas seguintes, até a linha em branco ou a próxima etiqueta. Não se corta um trecho no meio para caber no limite.

## 5. Sidecar `lume-caso.json`

Opcional. Se o arquivo estiver na mesma pasta, tem de bater com as partes. Campos:

```json
{
  "formato": "lume-caso/1",
  "processo": "PROC-SYN-1",
  "orgao": "ORGAO-SYN",
  "geradoEm": "2026-01-15T12:00:00Z",
  "origem": "botao",
  "ocr": "local",
  "documents": [
    {
      "id": "D1",
      "tipo": "petição inicial",
      "data": "2020-02-02",
      "paginasDocumento": [1],
      "paginasPdf": [1],
      "situacao": "lido"
    }
  ],
  "parts": [
    { "parte": 1, "total": 1, "arquivo": "lume-caso-parte-01-de-01.md", "ids": ["D1"] }
  ],
  "gaps": [
    { "id": "D2", "reason": "ilegivel", "paginaDocumento": 2, "paginaPdf": null }
  ]
}
```

- `ocr` é `local` (OCR nesta máquina), `nenhum` (não houve OCR) ou `visao` (leitura visual marcada pelo leitor, não pelo botão).
- `documents` segue a ordem do índice. `data` é `null` quando a célula é `—`. `paginasDocumento` é a expansão da célula `Págs. do documento`. `paginasPdf`, se vier, é o conjunto das páginas de PDF citadas nas etiquetas e nas lacunas daquele id.
- `parts` segue a ordem 1..N e repete `ids` e o nome do arquivo.
- `gaps` repete as linhas de lacuna, na mesma ordem. `reason` usa os quatro códigos.

## 6. Regras

1. Três localizadores distintos: ID, página do documento, página do PDF. Nenhum recebe o valor de outro. Página desconhecida omite-se. O trecho fica `[ID <id>]` e segue sendo texto.
2. Página não estimada. Proibido `~`, `aprox` e `aproximadamente` no arquivo de parte e no sidecar. Proibido preencher página do documento com a posição do arquivo, com a página do PDF ou com um intervalo “até o fim”.
3. Cada ID do índice aparece em exatamente uma parte (`ids` / `Ids:`). A concatenação, da parte 1 até a parte N, é o índice na mesma ordem.
4. Cada etiqueta cita um ID do índice e fica na parte que listou esse ID.
5. Lacunas listadas na parte 1, com motivo do conjunto fechado. Índice sem lacuna só quando a situação é `lido`.
6. Corte de cerca de 350000 caracteres por arquivo de parte. Uma parte com dois ou mais trechos não passa de 350000. Um único trecho pode passar, inteiro, sem corte no meio.
7. A ordem é a ordem da linha do tempo do PJe, a ordem do índice. O emissor não reordena por tipo, tamanho ou data decrescente.
8. `botao` e `work` são a mesma vista. Só o valor de `origem` muda. Work abre `#lume-autos` pelo botão `#lume-estudar`. O título da aba pronta é `Lume: pronto · N docs · L lacunas · parte 1 de T` (e `parte k de T` nas partes seguintes). O título de falha começa com `Lume: falhou`.

## 7. Conferência

`node format/src/validate.mjs <dir>` lê os `lume-caso-parte-*.md` e, se existir, `lume-caso.json`. A saída é um JSON com contagens (`parts`, `ids`, `tags`, `gaps`, `errors`) e códigos de erro. Não repete texto de trecho, id nem cabeçalho. Saída 0 quando fecha; 1 quando não fecha; 2 quando o diretório não foi dado ou não existe.

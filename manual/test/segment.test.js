import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { segmentAutos } from '../src/segment.js';
import { at, makePdf } from './pdf-fixture.js';

const LONG_DOC = '9876543210987654321098765432109876';

function footer(id, page) {
  return [
    at(`Num. ${id} - Pag. ${page}`, 72),
    at(`Numero do documento: ${LONG_DOC}`, 56),
    at(`https://exemplo.invalid/pje/ConsultaDocumento/listView.seam?x=${LONG_DOC}`, 40),
    at('Assinado eletronicamente por: PARTE ALFA - 01/02/2020 09:00:00', 24),
  ];
}

function autos() {
  return makePdf({
    pages: [
      [
        at('Id Data Documento/Tipo', 740),
        at('1001 01/02/2020 Peticao Inicial / Peticao', 720),
        at('1002 03/02/2020 Oficio', 700),
      ],
      [
        at('Texto da peticao. A sentenca foi apenas citada.', 700),
        ...footer('1001', 1),
      ],
      [],
      [
        at('Texto do oficio.', 700),
        ...footer('1002', 1),
      ],
    ],
    outlines: [
      { title: '1001 - Peticao Inicial', page: 1 },
      { title: 'Indice interno', page: 1 },
      { title: '1002 - Oficio', page: 3 },
    ],
  });
}

test('footer, index and outline together segment documents and leave a scan as a gap', async () => {
  const seen = [];
  const result = await segmentAutos(autos(), { onProgress: (event) => seen.push(event.page) });
  assert.deepEqual(seen, [1, 2, 3, 4]);
  assert.equal(result.pageCount, 4);
  const byId = Object.fromEntries(result.documents.map((doc) => [doc.docId, doc]));
  assert.equal(byId.indice.piece, 'outros');
  assert.ok(byId.indice.signals.includes('index'));
  assert.equal(byId['1001'].piece, 'petição inicial');
  assert.deepEqual(byId['1001'].signals, ['footer', 'outline', 'index']);
  assert.equal(byId['1001'].title, 'Peticao Inicial');
  assert.ok(byId['1001'].pages.includes(2));
  assert.ok(byId['1001'].pages.includes(3));
  assert.equal(byId['1002'].piece, 'ofício');
  assert.deepEqual(byId['1002'].pages, [4]);
  const scan = result.pages[2];
  assert.equal(scan.hasText, false);
  assert.equal(scan.chars, 0);
  const gap = result.gaps.find((item) => item.reason === 'unreadable_page' && item.page === 3);
  assert.match(gap.detail, /precisa OCR/);
  const passage = result.passages.find((item) => item.pdfPage === 2);
  assert.equal(passage.id, '1001@1:p1');
  assert.equal(passage.pageInDoc, 1);
  assert.equal(result.pages[1].footer.docId, '1001');
  assert.equal(result.pages[1].footer.pageInDoc, 1);
});

test('classification uses the document title, not words in the body', async () => {
  const result = await segmentAutos(autos());
  const petition = result.documents.find((doc) => doc.docId === '1001');
  assert.equal(petition.piece, 'petição inicial');
  assert.match(result.pages[1].text, /sentenca/);
});

test('footer page numbers are kept when the file does not start at page 1 of the piece', async () => {
  const pdf = makePdf({
    pages: [[at('Meio da peca.', 700), at('Num. 50 - Pag. 3', 40)]],
  });
  const result = await segmentAutos(pdf);
  assert.equal(result.passages[0].id, '50@1:p3');
  assert.equal(result.passages[0].pdfPage, 1);
});

test('outline alone cuts the file, and a title without an id still opens a range', async () => {
  const pdf = makePdf({
    pages: [
      [at('Primeira peca.', 700)],
      [at('Segunda peca.', 700)],
    ],
    outlines: [
      { title: 'Despacho', page: 0 },
      { title: 'Certidao', page: 1 },
    ],
  });
  const result = await segmentAutos(pdf);
  assert.equal(result.documents.length, 2);
  assert.equal(result.documents[0].piece, 'despacho');
  assert.equal(result.documents[0].signals.includes('outline'), true);
  assert.equal(result.documents[1].piece, 'certidão');
  assert.equal(result.documents[1].docId, 'contorno-2');
  assert.equal(result.passages[1].id, 'contorno-2@1:pdf2');
});

test('footer alone groups a following page that has no text layer', async () => {
  const pdf = makePdf({
    pages: [
      [at('Texto.', 700), at('Num. 7 - Pag. 1', 40)],
      [],
    ],
  });
  const result = await segmentAutos(pdf);
  assert.equal(result.documents.length, 1);
  assert.deepEqual(result.documents[0].pages, [1, 2]);
  assert.equal(result.documents[0].signals.includes('footer'), true);
  assert.equal(result.gaps.some((gap) => gap.reason === 'unreadable_page'), true);
});

test('index alone does not invent page bounds for later prose', async () => {
  const pdf = makePdf({
    pages: [
      [at('Id Data Documento/Tipo', 740), at('1001 01/02/2020 Peticao Inicial', 720)],
      [at('Corpo sem rodape.', 700)],
    ],
  });
  const result = await segmentAutos(pdf);
  assert.ok(result.documents.some((doc) => doc.docId === 'indice'));
  assert.equal(result.gaps.some((gap) => gap.reason === 'index_unplaced' && gap.docId === '1001'), true);
  assert.equal(result.gaps.some((gap) => gap.reason === 'footer_missing_id' && gap.page === 2), true);
});

test('no Num./Pág. yields pdfp id and footer_missing_id gap', async () => {
  const pdf = makePdf({ pages: [[at('Folha solta.', 700)]] });
  const result = await segmentAutos(pdf);
  assert.equal(result.documents[0].docId, 'pdfp1');
  assert.equal(result.documents[0].piece, 'outros');
  assert.deepEqual(result.documents[0].signals, []);
  assert.equal(result.gaps.some((gap) => gap.reason === 'footer_missing_id' && gap.page === 1), true);
});

const LONG30 = '123456789012345678901234567890';

function assertNoLongIdsInCitations(caseResult, pkg) {
  const citationLines = pkg.caseFile.split('\n').filter((line) => /^\[Id\s/.test(line) || /^id:\s/.test(line));
  const hay = [
    ...(caseResult.passages ?? []).map((passage) => passage.id),
    ...citationLines,
  ].join('\n');
  for (const match of hay.matchAll(/\d{13,}/g)) {
    assert.fail(`long digit run in citation output: ${match[0]}`);
  }
}

test('band-only long rodapé number never appears in passage id or paste citation', async () => {
  const pdf = makePdf({
    pages: [[
      at('Corpo.', 700),
      at(`Numero do documento: ${LONG30}`, 40),
    ]],
  });
  const result = await segmentAutos(pdf);
  const pkg = (await import('../src/prompt.js')).buildChatGPTPackage(result, { request: 'teste' });
  assert.equal(result.documents[0].docId, 'pdfp1');
  assert.match(result.passages[0].id, /^pdfp1@1:pdf1$/);
  assert.equal(result.pages[0].footer.docNumber, LONG30);
  assertNoLongIdsInCitations(result, pkg);
});

test('Num./Pág. above the band wins and keeps long numbers out of ids', async () => {
  const pdf = makePdf({
    pages: [[
      at('Num. 1001 - Pag. 3', 200),
      at('Corpo.', 700),
      at(`Numero do documento: ${LONG30}`, 40),
    ]],
  });
  const result = await segmentAutos(pdf);
  const pkg = (await import('../src/prompt.js')).buildChatGPTPackage(result, { request: 'teste' });
  assert.equal(result.documents[0].docId, '1001');
  assert.equal(result.passages[0].id, '1001@1:p3');
  assert.equal(result.gaps.some((gap) => gap.reason === 'footer_id_conflict'), false);
  assertNoLongIdsInCitations(result, pkg);
});

test('a corrupt file is a gap and does not throw', async () => {
  const result = await segmentAutos(new Uint8Array([1, 2, 3, 4]));
  assert.deepEqual(result.documents, []);
  assert.equal(result.gaps[0].reason, 'corrupt_file');
  assert.equal(result.gaps[0].detail.includes('/'), false);
});

test('injected OCR fills a blank page and a thrown engine leaves the gap', async () => {
  const pdf = makePdf({ pages: [[], [at('Num. 3 - Pag. 1', 40), at('Com texto.', 700)]] });
  let calls = 0;
  const read = await segmentAutos(pdf, {
    ocr: async ({ pageNumber }) => {
      calls += 1;
      assert.equal(pageNumber, 1);
      return { text: 'Num. 9 - Pag. 1\nTexto de OCR' };
    },
  });
  assert.equal(calls, 1);
  assert.equal(read.pages[0].hasText, true);
  assert.equal(read.pages[0].method, 'ocr');
  assert.equal(read.pages[0].footer.docId, '9');
  assert.equal(read.gaps.some((gap) => gap.page === 1 && gap.reason === 'unreadable_page'), false);

  const failed = await segmentAutos(pdf, {
    ocr: async () => { throw new Error('engine down'); },
  });
  assert.match(failed.gaps.find((gap) => gap.page === 1 && gap.reason === 'unreadable_page').detail, /precisa OCR/);
});

test('long rodapé ids with a short Num. do not raise footer_id_conflict', async () => {
  const pdf = makePdf({
    pages: [[
      at('Texto.', 700),
      at('Num. 1001 - Pag. 1', 56),
      at(`Numero do documento: ${LONG_DOC}`, 40),
    ]],
  });
  const result = await segmentAutos(pdf);
  assert.equal(result.documents[0].docId, '1001');
  assert.equal(result.gaps.some((gap) => gap.reason === 'footer_id_conflict'), false);
});

test('two Num./Pág. ids on one page record footer_id_conflict', async () => {
  const pdf = makePdf({
    pages: [[
      at('Texto.', 700),
      at('Num. 1001 - Pag. 1', 56),
      at('Num. 2002 - Pag. 1', 40),
    ]],
  });
  const result = await segmentAutos(pdf);
  assert.equal(result.gaps.some((gap) => gap.reason === 'footer_id_conflict'), true);
});

test('heading lines classify pieces when index and outline are absent', async () => {
  const pdf = makePdf({
    pages: [
      [at('SENTENCA', 720), at('Corpo.', 700), at('Num. 10 - Pag. 1', 40)],
      [at('PETICAO INICIAL', 720), at('Mais texto.', 700), at('Num. 11 - Pag. 1', 40)],
    ],
  });
  const result = await segmentAutos(pdf);
  assert.equal(result.documents.length, 2);
  assert.equal(result.documents[0].piece, 'sentença');
  assert.equal(result.documents[0].typeSource, 'heading');
  assert.ok(result.documents[0].signals.includes('heading'));
  assert.equal(result.documents[1].piece, 'petição inicial');
});

test('excelentissimo juiz is peticao inicial with weak heading', async () => {
  const pdf = makePdf({
    pages: [[
      at('EXCELENTISSIMO SENHOR JUIZ DE DIREITO', 720),
      at('Corpo da peticao.', 700),
      at('Num. 12 - Pag. 1', 40),
    ]],
  });
  const result = await segmentAutos(pdf);
  assert.equal(result.documents[0].piece, 'petição inicial');
  assert.equal(result.documents[0].headingWeak, true);
  assert.equal(result.documents[0].title, null);
});

test('a passed pdf.js document is accepted', async () => {
  const task = getDocument({ data: makePdf({ pages: [[at('Num. 4 - Pag. 1', 40), at('Ok.', 700)]] }), verbosity: 0 });
  const doc = await task.promise;
  const result = await segmentAutos(doc, { version: 'v2' });
  await task.destroy();
  assert.equal(result.passages[0].id, '4@v2:p1');
});

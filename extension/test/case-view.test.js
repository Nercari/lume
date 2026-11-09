import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseViewUrl, passageTag, renderCaseParts } from '../src/case-view.js';
import { PART_MAX_CHARS } from '../src/pack-bridge.js';

const caseResult = {
  pages: [
    { n: 1, docId: 'DOC2', pageInDoc: null, pdfPage: 1, hasText: true, method: 'text', text: 'primeiro' },
    { n: 2, docId: 'DOC2', pageInDoc: 4, pdfPage: 2, hasText: false, method: null, text: '' },
    { n: 3, docId: 'DOC1', pageInDoc: 1, pdfPage: 1, hasText: true, method: 'ocr', text: 'segundo' },
  ],
  documents: [
    { docId: 'DOC2', piece: 'outros', pages: [1, 2] },
    { docId: 'DOC1', piece: 'outros', pages: [3] },
  ],
  gaps: [{ docId: 'DOC2', pageInDoc: null, pdfPage: 2, detail: 'ilegível' }],
};

test('the case view keeps timeline order and does not invent a document page', () => {
  assert.equal(passageTag({ docId: 'DOC2', pageInDoc: null, pdfPage: 3 }), '[ID DOC2, pág. PDF 3]');
  assert.equal(passageTag({ docId: 'DOC2', pageInDoc: 4, pdfPage: 2 }), '[ID DOC2, pág. documento 4, pág. PDF 2]');
  assert.equal(passageTag({ docId: 'DOC1', pageInDoc: 1, pdfPage: 1 }), '[ID DOC1, pág. 1]');
  const view = renderCaseParts(caseResult, [
    { id: 'DOC2', date: '02/02/2020', state: 'processed' },
    { id: 'DOC1', date: null, state: 'processed' },
  ]);
  assert.equal(view.parts.length, 1);
  assert.match(view.parts[0].text, /Parte 1 de 1/);
  assert.match(view.parts[0].text, /ID \| Tipo \| Data \| Págs\. \| Situação/);
  const index = view.allText.split('\n');
  const doc2 = index.find((line) => line.startsWith('DOC2 |'));
  const doc1 = index.find((line) => line.startsWith('DOC1 |'));
  assert.ok(index.indexOf(doc2) < index.indexOf(doc1));
  assert.match(doc2, /02\/02\/2020 \| 2 \| parcial/);
  assert.match(view.allText, /\[ID DOC2, pág\. PDF 1\]/);
  assert.equal(view.allText.includes('pág. 2]'), false);
  assert.match(view.allText, /\[ID DOC1, pág\. 1\]/);
  assert.match(view.allText, /primeiro/);
  assert.ok(view.allText.indexOf('primeiro') < view.allText.indexOf('segundo'));
  assert.match(view.allText, /ilegível/);
  assert.equal(caseViewUrl('https://pje2g.trf1.jus.br/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=1&ca=token', 2),
    'https://pje2g.trf1.jus.br/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=1&ca=token#lume-autos/2');
  assert.equal(caseViewUrl('https://chatgpt.com/'), null);
});

test('a long case is split into ordered parts without cutting a passage', () => {
  const text = 'a'.repeat(20);
  const pages = Array.from({ length: 5 }, (_, i) => ({
    n: i + 1, docId: 'DOC', pageInDoc: i + 1, pdfPage: i + 1, hasText: true, method: 'text', text,
  }));
  const view = renderCaseParts({
    pages,
    documents: [{ docId: 'DOC', piece: 'outros', pages: pages.map((page) => page.n) }],
    gaps: [],
  }, [], 50);
  assert.ok(view.parts.length > 1);
  assert.match(view.parts[0].text, /Parte 1 de/);
  assert.match(view.parts[1].text, /Parte 2 de/);
  assert.match(view.parts[0].text, /Índice/);
  assert.equal(view.parts[1].text.includes('Índice'), false);
  const joined = view.parts.map((part) => part.text).join('\n');
  assert.equal(joined.split(text).length - 1, 5);
  assert.equal(PART_MAX_CHARS, 350000);
});

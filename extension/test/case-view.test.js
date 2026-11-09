import { test } from 'node:test';
import assert from 'node:assert/strict';
import { caseViewUrl, passageTag, renderCaseParts } from '../src/case-view.js';
import { PART_MAX_CHARS } from '../src/pack-bridge.js';
import { validateSet } from '../../format/src/validate.mjs';

const meta = { processo: 'TEST-CASE-A', orgao: 'ORGAO-SYN', geradoEm: '2026-01-15T12:00:00Z' };

const caseResult = {
  pages: [
    { n: 1, docId: 'DOC2', pageInDoc: null, pdfPage: 1, hasText: true, method: 'text', text: 'primeiro' },
    { n: 2, docId: 'DOC2', pageInDoc: 4, pdfPage: 2, hasText: false, method: null, text: '' },
    { n: 3, docId: 'DOC1', pageInDoc: 1, pdfPage: 1, hasText: true, method: 'ocr', text: 'segundo' },
  ],
  documents: [
    { docId: 'DOC2', piece: 'outros', date: '02/02/2020', pages: [1, 2] },
    { docId: 'DOC1', piece: 'laudo', pages: [3] },
  ],
  gaps: [{ docId: 'DOC2', pageInDoc: 4, pdfPage: 2, detail: 'ilegível' }],
};

test('the case view keeps timeline order and does not invent a document page', () => {
  assert.equal(passageTag({ docId: 'DOC2', pageInDoc: null, pdfPage: 3 }), '[ID DOC2, pág. PDF 3]');
  assert.equal(passageTag({ docId: 'DOC2', pageInDoc: 4, pdfPage: 2 }), '[ID DOC2, pág. 4, pág. PDF 2]');
  assert.equal(passageTag({ docId: 'DOC1', pageInDoc: 1, pdfPage: null }), '[ID DOC1, pág. 1]');
  assert.equal(passageTag({ docId: 'DOC1', pageInDoc: null, pdfPage: null }), '[ID DOC1]');
  const view = renderCaseParts(caseResult, [
    { id: 'DOC2', date: '02/02/2020', state: 'processed' },
    { id: 'DOC1', date: null, state: 'processed' },
  ], undefined, meta);
  assert.equal(view.parts.length, 1);
  assert.equal(view.parts[0].name, 'lume-caso-parte-01-de-01.md');
  assert.match(view.parts[0].text, /^---\nformato: lume-caso\/1\nprocesso: TEST-CASE-A\nparte: 1\ntotal: 1\nids: DOC2, DOC1\norigem: botao\n---\n/);
  assert.match(view.parts[0].body, /^lume-caso\/1\nProcesso: TEST-CASE-A\n/);
  assert.match(view.parts[0].body, /Ids: DOC2, DOC1/);
  assert.match(view.allText, /^lume-caso\/1\n/);
  assert.equal(view.allText.includes('Caso completo'), false);
  const index = view.parts[0].body.split('\n');
  const doc2 = index.find((line) => line.startsWith('DOC2 |'));
  const doc1 = index.find((line) => line.startsWith('DOC1 |'));
  assert.ok(index.indexOf(doc2) < index.indexOf(doc1));
  assert.match(doc2, /2020-02-02 \| 4 \| parcial/);
  assert.match(doc1, /laudo \| — \| 1 \| lido/);
  assert.match(view.allText, /\[ID DOC2, pág\. PDF 1\]\nprimeiro/);
  assert.match(view.allText, /\[ID DOC1, pág\. 1, pág\. PDF 1\]\nsegundo/);
  assert.match(view.allText, /- ID DOC2, pág\. 4, pág\. PDF 2: ilegivel/);
  assert.equal(caseViewUrl('https://pje2g.trf1.jus.br/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=1&ca=token', 2),
    'https://pje2g.trf1.jus.br/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=1&ca=token#lume-autos/2');
  assert.equal(caseViewUrl('https://chatgpt.com/'), null);
  const report = validateSet(
    view.parts.map((part) => ({ name: part.name, text: part.text })),
    JSON.stringify(view.sidecar),
  );
  assert.equal(report.ok, true, JSON.stringify(report.errors));
});

test('a long case is split into ordered parts without cutting a passage or an id', () => {
  const text = 'a'.repeat(20);
  const pages = Array.from({ length: 5 }, (_, i) => ({
    n: i + 1, docId: `D${i + 1}`, pageInDoc: 1, pdfPage: 1, hasText: true, method: 'text', text,
  }));
  const view = renderCaseParts({
    pages,
    documents: pages.map((page) => ({ docId: page.docId, piece: 'outros', pages: [page.n] })),
    gaps: [],
  }, [], 50, meta);
  assert.ok(view.parts.length > 1);
  assert.match(view.parts[0].text, /Parte 1 de/);
  assert.match(view.parts[1].body, /Parte 2 de/);
  assert.match(view.parts[0].body, /Índice/);
  assert.equal(view.parts[1].body.includes('Índice'), false);
  assert.match(view.parts[1].body, /^lume-caso\/1\n/);
  assert.match(view.parts[0].name, /^lume-caso-parte-01-de-\d{2}\.md$/);
  const joined = view.parts.map((part) => part.body).join('\n');
  assert.equal(joined.split(text).length - 1, 5);
  const ids = view.parts.flatMap((part) => part.ids);
  assert.deepEqual(ids, ['D1', 'D2', 'D3', 'D4', 'D5']);
  assert.equal(PART_MAX_CHARS, 350000);
  const report = validateSet(view.parts.map((part) => ({ name: part.name, text: part.text })), JSON.stringify(view.sidecar));
  assert.equal(report.ok, true, JSON.stringify(report.errors));
});

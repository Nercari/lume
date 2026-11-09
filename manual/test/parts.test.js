import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCasePack } from '../src/pack.js';
import {
  buildCasePackParts,
  extractPassagesFromPack,
  extractPassagesFromPartText,
  partFileName,
} from '../src/parts.js';
import { segmentText } from '../src/segment-text.js';

const BODY = 'Texto sintetico desta peca, longo o bastante para nao ser lacuna.';

function syntheticCaseResult(pageCount, textSize) {
  const chunk = `Parágrafo único. ${'x'.repeat(textSize)}`;
  const pages = [];
  const documents = [];
  for (let i = 0; i < pageCount; i += 1) {
    const docId = String(2000 + i);
    documents.push({ docId, piece: 'petição', title: `Peça ${i + 1}` });
    pages.push({ docId, pageInDoc: 1, hasText: true, text: chunk, method: 'text' });
  }
  return { origin: 'text', documents, pages, gaps: [] };
}

test('part file names follow lume-caso-parte-NN-de-NN.md', () => {
  assert.equal(partFileName(1, 3), 'lume-caso-parte-01-de-03.md');
  assert.equal(partFileName(12, 12), 'lume-caso-parte-12-de-12.md');
});

test('single-part case uses parte 01 de 01 and ends with FIM DA PARTE', () => {
  const result = segmentText(['Id 1001', BODY].join('\n'));
  const parts = buildCasePackParts(result, { maxChars: 120000 });
  assert.equal(parts.length, 1);
  assert.equal(parts[0].name, 'lume-caso-parte-01-de-01.md');
  assert.match(parts[0].text, /Pacote do caso — parte 1 de 1/);
  assert.match(parts[0].text, /FIM DA PARTE 1 DE 1\s*$/);
});

test('concatenated part passages match the single pack (order preserved)', () => {
  const text = [
    'Id 1001',
    BODY,
    '',
    'Id 1002',
    `${BODY} Segunda.`,
    '',
    'Id 1003',
    `${BODY} Terceira.`,
  ].join('\n');
  const result = segmentText(text);
  const pack = buildCasePack(result);
  const packPassages = extractPassagesFromPack(pack);
  const parts = buildCasePackParts(result, { maxChars: 5000 });
  const joined = parts.map((part) => extractPassagesFromPartText(part.text)).join('\n\n');
  assert.equal(joined, packPassages);
});

test('every document Id is in the index and only in the parts listed', () => {
  const result = syntheticCaseResult(8, 4000);
  const parts = buildCasePackParts(result, { maxChars: 12000 });
  assert.ok(parts.length > 1);
  const indexSection = parts[0].text.match(/## Índice das peças\s*\n\n([\s\S]*?)\n\n## Lacunas/)?.[1] ?? '';
  for (const doc of result.documents) {
    assert.match(indexSection, new RegExp(`\\| ${doc.docId} \\|`));
    const row = indexSection.split('\n').find((line) => line.includes(`| ${doc.docId} |`));
    const partCol = row?.split('|').map((c) => c.trim())[5] ?? '';
    const listed = partCol.split(',').map((p) => p.trim()).filter(Boolean);
    assert.ok(listed.length >= 1);
    for (const label of listed) {
      const partNum = Number(label.split('/')[0]);
      const partText = parts[partNum - 1].text;
      assert.ok(partText.includes(`Id ${doc.docId}`), `doc ${doc.docId} should appear in part ${partNum}`);
    }
    for (const [index, part] of parts.entries()) {
      const hasId = part.text.includes(`Id ${doc.docId}`);
      const partNum = index + 1;
      const should = listed.some((p) => Number(p.split('/')[0]) === partNum);
      assert.equal(hasId, should, `doc ${doc.docId} presence in part ${partNum}`);
    }
  }
});

test('~3 MB synthetic case splits into multiple parts within maxChars', () => {
  const targetBytes = 3 * 1024 * 1024;
  const chunkSize = 60_000;
  const pageCount = Math.ceil(targetBytes / chunkSize);
  const result = syntheticCaseResult(pageCount, chunkSize);
  const maxChars = 120_000;
  const parts = buildCasePackParts(result, { maxChars });
  assert.ok(parts.length > 1, `expected multiple parts, got ${parts.length}`);
  for (const part of parts) {
    assert.ok(part.text.length <= maxChars, `${part.name} length ${part.text.length} > ${maxChars}`);
    assert.match(part.text, /FIM DA PARTE \d+ DE \d+\s*$/);
  }
  const packPassages = extractPassagesFromPack(buildCasePack(result));
  const joined = parts.map((part) => extractPassagesFromPartText(part.text)).join('\n\n');
  assert.equal(joined.length, packPassages.length);
  assert.equal(joined, packPassages);
});

test('oversized single passage splits at paragraphs with continuation tag', () => {
  const paragraph = `Linha.\n\n${'y'.repeat(80_000)}`;
  const caseResult = {
    origin: 'text',
    documents: [{ docId: '9001', piece: 'petição', title: 'Grande' }],
    pages: [{ docId: '9001', pageInDoc: 1, hasText: true, text: paragraph, method: 'text' }],
    gaps: [],
  };
  const parts = buildCasePackParts(caseResult, { maxChars: 50_000 });
  const allText = parts.map((p) => p.text).join('\n');
  assert.match(allText, /\[Id 9001, fl\. 1\] \(continuação\)/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCasePack, PACK_FILENAME } from '../src/pack.js';

test('PACK_FILENAME has no case number', () => {
  assert.equal(PACK_FILENAME, 'lume-pacote-do-caso.md');
  assert.doesNotMatch(PACK_FILENAME, /\d{7,}/);
});

test('buildCasePack includes index, gaps and tagged passages', () => {
  const caseResult = {
    origin: 'text',
    documents: [{ docId: '1001', piece: 'petição', title: 'Inicial' }],
    pages: [{ docId: '1001', pageInDoc: 1, hasText: true, text: 'Conteúdo sintético da peça.', method: 'text' }],
    gaps: [],
  };
  const pack = buildCasePack(caseResult);
  assert.match(pack, /## Índice das peças/);
  assert.match(pack, /## Lacunas/);
  assert.match(pack, /## Texto/);
  assert.match(pack, /\[Id 1001, fl\. 1\]/);
  assert.match(pack, /Conteúdo sintético/);
});


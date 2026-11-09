import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PART_MAX_CHARS, packParts } from '../src/pack-bridge.js';

test('parts split only above about 100k tokens', async () => {
  assert.equal(PART_MAX_CHARS, 350000);
  const parts = await packParts({
    origin: 'pje',
    version: '1',
    pageCount: 1,
    pages: [{ n: 1, docId: 'D1', pageInDoc: 1, hasText: true, method: 'text', text: 'peticao', chars: 7 }],
    documents: [{ docId: 'D1', title: null, piece: 'outros', pages: [1] }],
    passages: [],
    gaps: [],
  });
  assert.equal(parts.length, 1);
  assert.equal(parts[0].name, 'lume-caso-parte-01-de-01.md');
  assert.match(parts[0].text, /^---\nformato: lume-caso\/1\nprocesso: —\nparte: 1\ntotal: 1\nids: D1\norigem: botao\n---/);
  assert.match(parts[0].text, /Índice/);
  assert.match(parts[0].text, /peticao|D1/);
  const source = readFileSync(new URL('../src/pack-bridge.js', import.meta.url), 'utf8');
  assert.equal(/from\s+['"][^'"]*parts\.js['"]/.test(source), false);
  assert.equal(source.includes('buildCasePack'), false);
});

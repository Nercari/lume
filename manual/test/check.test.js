import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer } from '../src/check.js';
import { segmentText } from '../src/segment-text.js';
import { makePjeExport } from './fixtures-pjer/make-fixture.js';

function cited(answer, result) {
  const checked = checkAnswer(answer, result);
  assert.equal(checked.citations.length, 1, answer);
  return checked.citations[0];
}

test('[Id X] without a sheet is exists, unreadable, or missing_document', () => {
  const readable = {
    pages: [
      { docId: '1001', pageInDoc: 1, hasText: true },
      { docId: '1001', pageInDoc: 2, hasText: false },
    ],
    gaps: [{ docId: '1001', reason: 'image_no_text', pageInDoc: 2 }],
  };
  assert.equal(cited('[Id 1001]', readable).status, 'exists');
  assert.equal(cited('[Id 1001]', readable).pageInDoc, null);
  assert.equal(cited('[Id 1001, fl. 1]', readable).status, 'exists');
  assert.equal(cited('[Id 1001, p. 1]', readable).status, 'exists');
  assert.equal(cited('[Id 1001, fl. 2]', readable).status, 'unreadable');
  assert.equal(cited('[Id 1001, p. 9]', readable).status, 'missing_page');
  assert.equal(cited('[Id 9999]', readable).status, 'missing_document');
  assert.equal(cited('[Id 9999, fl. 1]', readable).status, 'missing_document');

  const gapOnly = { pages: [], gaps: [{ docId: '7', reason: 'image_no_text' }] };
  assert.equal(cited('[Id 7]', gapOnly).status, 'unreadable');
  assert.equal(cited('[Id 7, fl. 1]', gapOnly).status, 'missing_page');

  const wholeGap = {
    pages: [{ docId: '1002', pageInDoc: 1, hasText: false }],
    gaps: [{ docId: '1002', reason: 'image_no_text', detail: 'imagem/sem texto' }],
  };
  assert.equal(cited('[Id 1002]', wholeGap).status, 'unreadable');
  assert.equal(cited('[Id 1002, fl. 1]', wholeGap).status, 'unreadable');
  assert.equal(cited('[Id 1002, p. 4]', wholeGap).status, 'missing_page');
});

test('a bare id still counts as a citation on a decisive sentence', () => {
  const result = {
    pages: [{ docId: '1001', pageInDoc: 1, hasText: true }],
    gaps: [],
  };
  const bare = checkAnswer('Julgo procedente o pedido. [Id 1001]', result);
  assert.equal(bare.ok, true);
  assert.equal(bare.citations[0].status, 'exists');
  const missing = checkAnswer('Julgo procedente o pedido.', result);
  assert.equal(missing.ok, false);
  assert.equal(missing.uncitedDecisive[0].ruleId, 'julgamento');
});

test('PJe pieces resolve [Id X] and [Id X, fl. Y], and a gap id is unreadable', () => {
  const fixture = makePjeExport({
    pieces: [
      {
        id: '100000001',
        fields: ['Despacho', 'Parte Fictícia'],
        raw: ['Texto sintetico da peca, longo o bastante para nao ser lacuna.'],
      },
      {
        id: '100000002',
        fields: ['Certidão', 'Cartório Fictício'],
        raw: [],
        gap: 'image',
      },
    ],
  });
  const result = segmentText(fixture.text);
  assert.equal(cited('[Id 100000001]', result).status, 'exists');
  assert.equal(cited('[Id 100000001, fl. 1]', result).status, 'exists');
  assert.equal(cited('[Id 100000001, p. 1]', result).status, 'exists');
  assert.equal(cited('[Id 100000001, fl. 2]', result).status, 'missing_page');
  assert.equal(cited('[Id 100000002]', result).status, 'unreadable');
  assert.equal(cited('[Id 100000002, fl. 1]', result).status, 'unreadable');
  assert.equal(cited('[Id 100000099]', result).status, 'missing_document');
});

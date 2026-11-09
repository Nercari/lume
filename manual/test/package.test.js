import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_METHOD } from '../../chat-editor/src/method.js';
import '../src/index.js';
import { checkAnswer } from '../src/check.js';
import { ADAPTED_INSTRUCTIONS, buildChatGPTPackage, splitParts } from '../src/prompt.js';
import { segmentAutos } from '../src/segment.js';
import { at, makePdf } from './pdf-fixture.js';

function sampleResult() {
  return {
    pages: [
      { n: 2, hasText: true, docId: '1001', pageInDoc: 1, footer: { docId: '1001', pageInDoc: 1 } },
      { n: 3, hasText: false, docId: '1001', pageInDoc: 2, footer: null },
    ],
    passages: [
      { id: '1001@1:p1', docId: '1001', version: '1', pageInDoc: 1, pdfPage: 2, text: 'Fato local da peca.', method: 'pdf-text', hasText: true },
    ],
    gaps: [{ reason: 'unreadable_page', page: 3, detail: 'precisa OCR' }],
    documents: [],
  };
}

test('the prompt adapts every default-method instruction and requires manual citations', () => {
  assert.equal(ADAPTED_INSTRUCTIONS.length, DEFAULT_METHOD.instructions.length);
  assert.match(DEFAULT_METHOD.instructions.at(-1), /no passage ids/i);
  const pkg = buildChatGPTPackage(sampleResult(), { docType: 'despacho', request: 'minuta de despacho' });
  assert.match(pkg.prompt, /neste computador/);
  assert.match(pkg.prompt, /\[Id <docId>, fl\. <n>\]/);
  assert.match(pkg.prompt, /Tipo de peça: Despacho/);
  assert.match(pkg.prompt, /Determinação/);
  assert.doesNotMatch(pkg.prompt, /no passage ids/i);
  for (const line of ADAPTED_INSTRUCTIONS) assert.ok(pkg.prompt.includes(line));
  assert.match(pkg.caseFile, /\[Id 1001, fl\. 1\]/);
  assert.match(pkg.caseFile, /1001@1:p1/);
  assert.match(pkg.caseFile, /página do PDF: 2/);
  assert.match(pkg.gapsSummary, /precisa OCR/);
  assert.match(pkg.gapsSummary, /3/);
  assert.equal(pkg.parts.length, 1);
});

test('an unnamed request defaults to decisão, and parts stay under the character limit', () => {
  const pkg = buildChatGPTPackage(sampleResult(), { request: '' });
  assert.match(pkg.prompt, /Decisão interlocutória/);
  assert.match(pkg.prompt, /Pedido: não informado/);
  const long = buildChatGPTPackage({
    passages: [
      { id: '1@1:p1', docId: '1', pageInDoc: 1, pdfPage: 1, text: 'A'.repeat(800), hasText: true },
      { id: '1@1:p2', docId: '1', pageInDoc: 2, pdfPage: 2, text: 'B'.repeat(800), hasText: true },
    ],
    gaps: [],
  }, { docType: 'sentenca', charLimit: 500 });
  assert.ok(long.parts.length > 1);
  assert.ok(long.parts.every((part) => part.length <= 500));
  assert.equal(long.parts.join(''), long.caseFile);
  assert.throws(() => splitParts('abc', 100), RangeError);
});

test('checkAnswer accepts a real citation and flags a missing id, a missing page, and an uncited ruling', () => {
  const result = sampleResult();
  const good = checkAnswer('Julgo procedente o pedido. [Id 1001, p. 1]', result);
  assert.equal(good.ok, true);
  assert.equal(good.citations[0].status, 'exists');
  const sheet = checkAnswer('Julgo procedente o pedido. [Id 1001, fl. 1]', result);
  assert.equal(sheet.ok, true);
  assert.equal(sheet.citations[0].status, 'exists');
  assert.equal(good.uncitedDecisive.length, 0);

  const missing = checkAnswer('Texto. [Id 9999, p. 1]', result);
  assert.equal(missing.ok, false);
  assert.equal(missing.unknown[0].status, 'missing_document');

  const page = checkAnswer('Texto. [Id 1001, p. 9]', result);
  assert.equal(page.unknown[0].status, 'missing_page');

  const unread = checkAnswer('Texto. [Id 1001, p. 2]', result);
  assert.equal(unread.citations[0].status, 'unreadable');

  const bare = checkAnswer('Julgo procedente o pedido.', result);
  assert.equal(bare.uncitedDecisive[0].ruleId, 'julgamento');
  assert.equal(bare.ok, false);

  const followed = checkAnswer('Julgo procedente.\n[Id 1001, p. 1]', result);
  assert.equal(followed.uncitedDecisive.length, 0);
});

test('a segmented file round-trips into a package whose citation check passes', async () => {
  const pdf = makePdf({
    pages: [[at('Fato da peca de teste.', 700), at('Num. 15 - Pag. 1', 40)]],
  });
  const segmented = await segmentAutos(pdf);
  const pkg = buildChatGPTPackage(segmented, { docType: 'sentenca', request: 'minuta' });
  const answer = `Relatorio.\n\nJulgo procedente. [Id 15, p. 1]`;
  const checked = checkAnswer(answer, segmented);
  assert.equal(checked.ok, true);
  assert.match(pkg.caseFile, /\[Id 15, fl\. 1\]/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDocument, measure, errorRates, reconcile } from '../src/index.js';
import { makeScan, fakeOcr } from './fixtures.js';

test('CER and WER on known strings', () => {
  assert.deepEqual(errorRates('abc def', 'abc def'), { chars: 0, charTotal: 7, words: 0, wordTotal: 2, cer: 0, wer: 0 });
  const r = errorRates('kitten sitting', 'sitten  sitting ');
  assert.equal(r.chars, 1);
  assert.equal(r.words, 1);
  assert.equal(r.cer, 1 / 14);
  assert.equal(r.wer, 1 / 2);
});

test('CER harness measures OCR text against human-checked excerpts and feeds the quality report', async () => {
  const item = { id: 'M1', version: '1', kind: 'document', expectedPages: 1, state: 'processed' };
  const r = await extractDocument(item, { bytes: makeScan([['Motor speed 1450 rpm', 0.9], ['Duty cyc1e 40%', 0.9]]), contentType: 'image/png' }, { ocr: fakeOcr });
  const excerpts = [{ docId: 'M1', version: '1', page: 1, truth: 'Motor speed 1450 rpm\nDuty cycle 40%', checkedBy: 'synthetic-fixture' }];
  const m = measure(excerpts, [r]);
  assert.equal(m.excerpts, 1);
  assert.equal(m.items[0].chars, 1);
  assert.equal(m.cer, 1 / 35);
  assert.equal(m.wer, 1 / 7);
  const report = reconcile({ status: 'complete', items: [item] }, [r], m);
  assert.deepEqual(report.quality.recognitionAccuracy, { excerpts: 1, cer: 1 / 35, wer: 1 / 7 });
});

test('an excerpt with no extracted page counts as fully wrong, and unchecked excerpts are refused', () => {
  const m = measure([{ docId: 'X', version: '1', page: 1, truth: 'abcd', checkedBy: 'h' }], []);
  assert.deepEqual([m.items[0].found, m.cer], [false, 1]);
  assert.throws(() => measure([{ docId: 'X', version: '1', page: 1, truth: 'a' }], []), /human-checked/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractCase, reconcile } from '../src/index.js';
import { makePdf, TEXT } from './fixtures.js';

const inventory = (items) => ({ status: 'complete', stopReason: null, items: items.map((i) => ({ version: '1', kind: 'document', state: 'processed', href: null, ...i })) });
const pdf = (pages) => ({ bytes: makePdf(pages), contentType: 'application/pdf' });

test('reconciliation catches a page that disappeared without a gap record', async () => {
  const inv = inventory([{ id: 'A', expectedPages: 2 }, { id: 'B', expectedPages: 1 }]);
  const results = await extractCase(inv, async (i) => (i.id === 'A' ? pdf([TEXT.p1, TEXT.p2]) : pdf([['Single page.']])));
  assert.equal(reconcile(inv, results).ok, true);

  results[0].pages = results[0].pages.filter((p) => p.page !== 2); // a bug or a lost record drops page 2
  const report = reconcile(inv, results);
  assert.equal(report.ok, false);
  assert.deepEqual(report.silentOmissions, [{ docId: 'A', page: 2, problem: 'page without text and without gap' }]);
});

test('a file shorter than the inventory gets a gap per missing page, so the omission is visible', async () => {
  const inv = inventory([{ id: 'A', expectedPages: 3 }]);
  const results = await extractCase(inv, async () => pdf([TEXT.p1]));
  assert.deepEqual(results[0].gaps.map((g) => [g.page, g.reason]), [[2, 'page_count_mismatch'], [3, 'page_count_mismatch']]);
  const report = reconcile(inv, results);
  assert.equal(report.ok, true);
  assert.equal(report.coverage.pageGaps, 2);
  assert.equal(report.documents[0].status, 'partial');
});

test('reconciliation catches a missing document, an unknown version and an incomplete inventory', async () => {
  const inv = inventory([{ id: 'A', expectedPages: 1 }, { id: 'B', expectedPages: 1 }]);
  const results = await extractCase(inv, async () => pdf([['x']]));
  results.splice(1, 1);
  results.push({ ...results[0], version: '7' });
  const report = reconcile({ ...inv, status: 'incomplete' }, results);
  assert.deepEqual(report.silentOmissions.map((o) => o.problem), [
    'inventory is incomplete; its list may be short',
    'no extraction result and no gap',
    'result for version 7 not in inventory',
  ]);
});

test('a page without a text layer and no OCR is a gap, and coverage never claims accuracy', async () => {
  const inv = inventory([{ id: 'S', expectedPages: 2 }]);
  const results = await extractCase(inv, async () => pdf([TEXT.p1, []]));
  assert.deepEqual(results[0].gaps.map((g) => [g.page, g.reason]), [[2, 'unreadable_page']]);
  const report = reconcile(inv, results);
  assert.equal(report.ok, true);
  assert.deepEqual([report.coverage.pagesWithText, report.coverage.pageGaps], [1, 1]);
  assert.equal(report.quality.recognitionAccuracy, 'unmeasured');
});

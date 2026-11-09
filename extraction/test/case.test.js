// Integration with #4: a real readCase() inventory from the extension's own mock transport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readCase } from '../../extension/src/core.js';
import { page1, PAGE1, transport } from '../../extension/test/fixtures.js';
import { extractCase, reconcile, passagesOf } from '../src/index.js';
import { makePdf, TEXT } from './fixtures.js';

const files = {
  D1: { bytes: makePdf([TEXT.p1, TEXT.p2, ['Torque 12 Nm.']]), contentType: 'application/pdf' },
  D1A: { bytes: new TextEncoder().encode('%PDF-1.4 truncated garbage'), contentType: 'application/pdf' },
  D3: { bytes: new TextEncoder().encode('<p>Filter mesh 50 &amp; 100 microns.</p><p>Clean monthly.</p>'), contentType: 'text/html' },
};

async function run() {
  const inventory = await readCase({ startDoc: page1(), startUrl: PAGE1, fetchPage: transport().fetchPage });
  const results = await extractCase(inventory, async (item) => files[item.id]);
  return { inventory, results };
}

test('corrupt file isolation: a corrupt attachment becomes a gap and the other documents keep their text', async () => {
  const { results } = await run();
  const d1a = results.find((r) => r.docId === 'D1A');
  assert.deepEqual(d1a.gaps.map((g) => g.reason), ['corrupt_file']);
  const d1 = results.find((r) => r.docId === 'D1');
  assert.equal(d1.pages.length, 3);
  assert.equal(d1.gaps.length, 0);
  assert.equal(d1.pages[0].text, TEXT.p1.join('\n'));
  assert.equal(results.find((r) => r.docId === 'D3').pages[0].text, 'Filter mesh 50 & 100 microns.\nClean monthly.');
});

test('unsupported media, restricted, missing and failed items become explicit gap records', async () => {
  const { results } = await run();
  const reasons = Object.fromEntries(results.map((r) => [r.docId, r.gaps.map((g) => g.reason).join(',')]));
  assert.equal(reasons.D2, 'restricted');
  assert.equal(reasons.D4, 'unsupported_media');
  assert.equal(results.find((r) => r.docId === 'D4').gaps[0].detail, 'video/mp4');
  assert.equal(reasons.D5, 'missing');
  assert.equal(reasons.D6, 'fetch_failed');
  assert.equal(reasons.D7, 'missing');
});

test('reconciliation of the full case has zero silent omissions and keeps coverage apart from quality', async () => {
  const { inventory, results } = await run();
  const report = reconcile(inventory, results);
  assert.deepEqual(report.silentOmissions, []);
  assert.equal(report.ok, true);
  assert.equal(report.coverage.documents, inventory.items.length);
  assert.equal(report.coverage.documentsWithText, 2);
  assert.equal(report.quality.recognitionAccuracy, 'unmeasured');
  assert.ok(passagesOf(results).every((p) => p.method !== undefined && p.docId && p.version && p.page));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractDocument, canSupportDecisive, forTransmission, passagesOf, createTesseractAdapter, reconcile } from '../src/index.js';
import { makeScan, fakeOcr } from './fixtures.js';

const scanItem = { id: 'SC1', version: '1', kind: 'document', expectedPages: 1, state: 'processed' };

test('low-confidence OCR passages are flagged and cannot support a decisive fact', async () => {
  const r = await extractDocument(scanItem, { bytes: makeScan([['Valve V2 closed at 14:05', 0.95], ['Va1ve V3 c1osed ?', 0.42], ['no score', null]]), contentType: 'image/png' }, { ocr: fakeOcr });
  const [good, bad, none] = passagesOf([r]);
  assert.deepEqual([good.method, good.confidence, good.lowConfidence], ['ocr:fake-ocr-1', 0.95, false]);
  assert.deepEqual(canSupportDecisive(good), { ok: true, reason: null });
  assert.equal(bad.lowConfidence, true);
  assert.deepEqual(canSupportDecisive(bad), { ok: false, reason: 'low_confidence' });
  assert.equal(none.lowConfidence, true);
  assert.equal(canSupportDecisive(none).ok, false);
  assert.deepEqual(r.images.map((i) => i.page), [1]);

  const report = reconcile({ status: 'complete', items: [scanItem] }, [r]);
  assert.deepEqual([report.quality.ocrPassages, report.quality.lowConfidencePassages], [3, 2]);
  assert.equal(report.coverage.pagesWithText, 1); // the page counts as covered; quality says 2 of 3 passages are weak
});

test('the threshold is a parameter and a scan without an OCR engine is a gap', async () => {
  const file = { bytes: makeScan([['Line', 0.7]]), contentType: 'image/png' };
  assert.equal(passagesOf([await extractDocument(scanItem, file, { ocr: fakeOcr, threshold: 0.6 })])[0].lowConfidence, false);
  const noOcr = await extractDocument(scanItem, file);
  assert.deepEqual(noOcr.gaps.map((g) => g.reason), ['unreadable_page']);
});

test('an OCR engine failure is a page gap, not a crash', async () => {
  const r = await extractDocument(scanItem, { bytes: new Uint8Array([1, 2]), contentType: 'image/jpeg' }, { ocr: fakeOcr });
  assert.deepEqual(r.gaps.map((g) => g.reason), ['ocr_failed']);
});

test('text excluded from transmission becomes a gap record that names the passage', async () => {
  const r = await extractDocument(scanItem, { bytes: makeScan([['keep', 0.9], ['secret serial 0000', 0.9]]), contentType: 'image/png' }, { ocr: fakeOcr });
  const { send, gaps } = forTransmission(passagesOf([r]), (p) => (p.text.includes('serial') ? 'policy: serial numbers stay local' : null));
  assert.deepEqual(send.map((p) => p.text), ['keep']);
  assert.equal(gaps[0].reason, 'excluded_from_transmission');
  assert.equal(gaps[0].passageId, passagesOf([r])[1].id);
});

test('tesseract.js adapter maps 0..100 confidence and x0/y0/x1/y1 boxes', async () => {
  const worker = { recognize: async () => ({ data: { blocks: [{ paragraphs: [{ lines: [{ text: 'Belt tension ok\n', confidence: 88, bbox: { x0: 10, y0: 20, x1: 110, y1: 40 } }] }] }] } }) };
  const r = await extractDocument(scanItem, { bytes: new Uint8Array(1), contentType: 'image/png' }, { ocr: createTesseractAdapter(worker) });
  const [p] = passagesOf([r]);
  assert.deepEqual([p.text, p.confidence, p.region, p.method], ['Belt tension ok', 0.88, [10, 20, 100, 20], 'ocr:tesseract.js']);
});

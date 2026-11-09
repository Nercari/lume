import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CaseStore, MemoryBackend, createAesGcmCodec } from '../../case-store/src/index.js';
import { extractDocument, persist, openSource, passagesOf } from '../src/index.js';
import { makePdf, makeScan, fakeOcr, fakeRenderer, TEXT } from './fixtures.js';

function caseEnv() {
  const backend = new MemoryBackend();
  const c = { t: 1_000_000 };
  const store = new CaseStore({ backend, codec: createAesGcmCodec({ backend }), now: () => c.t, sleep: async () => {} });
  return { store, clock: c };
}

const item = (version, expectedPages = 2) => ({ id: 'DOC9', version, kind: 'document', expectedPages, href: `https://example.test/doc?id=DOC9&v=${version}` });

test('provenance round-trip: each passage opens the correct document, version, page and offsets', async () => {
  const { store } = caseEnv();
  const rec = await store.openCase('fixture-prov');
  const v1 = await extractDocument(item('1'), { bytes: makePdf([TEXT.p1, TEXT.p2]), contentType: 'application/pdf' });
  const v2 = await extractDocument(item('2'), { bytes: makePdf([['Revised: rated flow 45 litres per minute.'], TEXT.p2]), contentType: 'application/pdf' });
  await persist(rec, v1, { imageTtlMs: 60_000 });
  await persist(rec, v2, { imageTtlMs: 60_000 });

  const target = passagesOf([v1]).find((p) => p.text.startsWith('Inlet'));
  assert.deepEqual([target.docId, target.version, target.page, target.method, target.confidence], ['DOC9', '1', 1, 'pdf-text', null]);
  assert.equal(target.region.length, 4);
  const src = await openSource(rec, target.id);
  assert.equal(src.found, true);
  assert.equal(src.version, '1');
  assert.equal(src.page, 1);
  assert.equal(src.pageText.slice(src.start, src.end), 'Inlet pressure must stay below 6 bar.');
  assert.equal(src.link, 'https://example.test/doc?id=DOC9&v=1#page=1');
  assert.equal(src.imageStatus, 'not_applicable');

  // The new version did not replace the old one, and each passage resolves to its own version.
  const p2 = passagesOf([v2])[0];
  assert.equal((await openSource(rec, p2.id)).passage.text, 'Revised: rated flow 45 litres per minute.');
  assert.equal((await openSource(rec, 'DOC9@3:p1:0-5')).found, false);
});

test('OCR page image stays inspectable inside the retention TTL and reports expiry after it', async () => {
  const { store, clock } = caseEnv();
  const rec = await store.openCase('fixture-ocr');
  const scan = makeScan([['Gauge reads 3.5 bar', 0.97]]);
  const r = await extractDocument(item('1', 2), { bytes: makePdf([TEXT.p1, []]), contentType: 'application/pdf' }, { ocr: fakeOcr, renderPage: fakeRenderer({ 2: scan }) });
  assert.equal(r.pages[1].method, 'ocr:fake-ocr-1');
  await persist(rec, r, { imageTtlMs: 60_000 });
  const p = r.pages[1].passages[0];
  const open = await openSource(rec, p.id);
  assert.equal(open.page, 2);
  assert.equal(open.imageStatus, 'retained');
  assert.deepEqual(open.image.bytes, scan);
  clock.t += 60_001;
  const later = await openSource(rec, p.id);
  assert.equal(later.imageStatus, 'expired');
  assert.equal(later.image, null);
  assert.equal(later.passage.text, 'Gauge reads 3.5 bar'); // text record stays; only the image left retention
});

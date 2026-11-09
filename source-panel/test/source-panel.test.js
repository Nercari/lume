import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingest, GateError } from '../../analysis/src/index.js';
import { USER_ACTION } from '../../chat-editor/src/index.js';
import { openClaim, buildPanel, recordReview, checkCitation } from '../src/index.js';
import { caseWith, bySubject, store, extract, inventory, item, html, FILES, ITEMS, LOW_ID } from './fixtures.js';

const human = (reviews, f, passage, verdict) => recordReview(reviews, { finding: f.id, passageId: passage.passageId, claimText: f.text, passageText: passage.excerpt }, verdict, USER_ACTION, { by: 'reviewer-1', now: 5 });

test('open provenance for a supported claim: document ID, version, page, excerpt, link, and OCR image when relevant', async () => {
  const { c, L } = await caseWith();
  const flow = bySubject(L, 'pump.flow');
  const o = await openClaim(c, L, flow.id);
  assert.equal(o.found, true);
  const [cit] = o.citations;
  assert.deepEqual([cit.docId, cit.version, cit.page, cit.excerpt], ['D1', '1', 1, 'Pump TX-200 rated flow 40 litres per minute.']);
  assert.equal(cit.link, 'https://example.test/doc?id=D1#page=1');
  assert.deepEqual([cit.existence, cit.ocr, cit.imageStatus, cit.semantic, cit.status], ['found', 'not_applicable', 'not_applicable', 'uninspected', 'unverified']);

  const leak = await openClaim(c, L, bySubject(L, 'leak', 'fact').id);
  assert.equal(leak.citations[0].ocr, 'reliable');
  assert.equal(leak.citations[0].imageStatus, 'retained');
  assert.ok(leak.citations[0].image.bytes.length > 0);
  assert.equal((await openClaim(c, L, 'nope')).found, false);
});

test('literal quote match alone does not prove support; only a human inspection verifies', async () => {
  const { c, L } = await caseWith();
  const flow = bySubject(L, 'pump.flow');
  const draft = { sections: [{ id: 's1', text: 'The pump has "rated flow 40 litres per minute".', uses: [flow.id] }] };
  let p = await buildPanel(c, L, draft);
  assert.equal(p.entries[0].citations[0].quote, 'exact');
  assert.equal(p.entries[0].status, 'unverified');

  const reviews = {};
  human(reviews, flow, p.entries[0].citations[0], 'supports');
  p = await buildPanel(c, L, draft, { reviews });
  assert.equal(p.entries[0].status, 'verified');
  assert.deepEqual(p.entries[0].citations[0].review, { verdict: 'supports', by: 'reviewer-1', at: 5 });

  human(reviews, flow, p.entries[0].citations[0], 'does_not_support');
  p = await buildPanel(c, L, draft, { reviews });
  assert.equal(p.entries[0].citations[0].quote, 'exact');
  assert.equal(p.entries[0].status, 'not_supported');
});

test('quote mismatch is not verified, even after a human marks support', async () => {
  const { c, L } = await caseWith();
  const flow = bySubject(L, 'pump.flow');
  const draft = { sections: [{ id: 's1', text: 'The pump has “rated flow 45 litres per minute”.', uses: [flow.id] }] };
  const reviews = {};
  human(reviews, flow, (await openClaim(c, L, flow.id)).citations[0], 'supports');
  const p = await buildPanel(c, L, draft, { reviews });
  assert.equal(p.entries[0].citations[0].quote, 'mismatch');
  assert.equal(p.entries[0].status, 'quote_mismatch');
});

test('low-confidence OCR cannot verify; a decisive claim resting on it is an unsupported allegation', async () => {
  const extra = [{ docId: 'D4', assertion: { class: 'fact', subject: 'note', value: 1, decisive: false, text: 'A gauge note exists', support: [LOW_ID] } }];
  const { c, L } = await caseWith({ extra });
  const note = bySubject(L, 'note');
  const reviews = {};
  const cit = await checkCitation(c, L, note, LOW_ID);
  human(reviews, note, cit, 'supports');
  const after = await checkCitation(c, L, note, LOW_ID, { reviews });
  assert.equal(after.semantic, 'supports');
  assert.equal(after.ocr, 'low_confidence');
  assert.equal(after.status, 'ocr_unreliable');
  assert.equal(after.imageStatus, 'retained', 'OCR image is open for the reviewer');

  const alleg = bySubject(L, 'leak', 'allegation');
  const p = await buildPanel(c, L, { sections: [{ id: 's1', text: 'Leak alleged.', uses: [alleg.id] }] });
  assert.equal(p.entries[0].status, 'unsupported_allegation');
  assert.equal(p.entries[0].rejected[0].reason, 'low_confidence');
  assert.equal(p.entries[0].rejected[0].imageStatus, 'retained');
  assert.deepEqual(p.unaccounted, []);
});

test('uninspected citations are never verified, and only a user action can record a review', async () => {
  const { c, L } = await caseWith();
  const uses = Object.values(L.findings).filter((f) => !f.stale).map((f) => f.id);
  const p = await buildPanel(c, L, { sections: [{ id: 's1', text: 'All findings.', uses }], conclusion: { text: 'x', uses } });
  assert.ok(p.entries.length >= 6);
  assert.ok(p.entries.every((e) => e.status !== 'verified' && e.citations.every((x) => x.status !== 'verified')));
  assert.deepEqual(p.unaccounted, []);
  const f = bySubject(L, 'pump.flow');
  const target = { finding: f.id, passageId: f.support[0], claimText: f.text, passageText: 'x' };
  assert.throws(() => recordReview({}, target, 'supports', 'user', { by: 'model' }), GateError);
  assert.throws(() => recordReview({}, target, 'supports', Symbol('chat-editor.user-action'), { by: 'model' }), GateError);
  assert.throws(() => recordReview({}, target, 'verified', USER_ACTION, { by: 'r' }), TypeError);
});

test('stale citations are labeled stale: changed source version, and a review of changed text', async () => {
  const { c, L, inv } = await caseWith();
  const flow = bySubject(L, 'pump.flow');
  const draft = { sections: [{ id: 's1', text: 'Flow.', uses: [flow.id] }] };
  const reviews = {};
  const cit = (await openClaim(c, L, flow.id)).citations[0];
  recordReview(reviews, { finding: flow.id, passageId: cit.passageId, claimText: 'an older claim text', passageText: cit.excerpt }, 'supports', USER_ACTION, { by: 'r' });
  assert.equal((await buildPanel(c, L, draft, { reviews })).entries[0].status, 'stale', 'review of other claim text');

  const files = { ...FILES, D1: html('Pump TX-200 rated flow 45 litres per minute.', 'Inlet pressure stays below 6 bar.') };
  const results = await extract(inv, files);
  await store(c, results);
  ingest(L, inv, results);
  const p = await buildPanel(c, L, draft, { reviews });
  assert.ok(L.findings[flow.id].stale);
  assert.equal(p.entries[0].status, 'stale');
});

test('decisive assertions without inspectable support get unsupported allegation / inference / uncertainty labels', async () => {
  const extra = [
    { docId: 'D1', assertion: { class: 'legal_conclusion', decisive: true, text: 'The rule applies' } },
    { docId: 'D1', assertion: { class: 'unknown', decisive: true, text: 'Seal age unknown' } },
    { docId: 'D1', assertion: { class: 'fact', decisive: true, text: 'Valve was replaced' } },
  ];
  const { c, L } = await caseWith({ extra });
  const ids = Object.values(L.findings).filter((f) => extra.some((e) => e.assertion.text === f.text)).map((f) => f.id);
  const p = await buildPanel(c, L, { sections: [{ id: 's1', text: 'x', uses: ids }] });
  assert.deepEqual(p.entries.map((e) => e.status).sort(), ['inference', 'uncertainty', 'unsupported_allegation']);
  assert.deepEqual(p.unaccounted, []);
  // A finding id that is not in the case is shown as such, never as verified.
  const q = await buildPanel(c, L, { sections: [{ id: 's1', text: 'x', uses: ['ghost#0'] }] });
  assert.equal(q.entries[0].status, 'not_in_case');
});

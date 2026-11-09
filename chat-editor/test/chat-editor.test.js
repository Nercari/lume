import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingest, analyze, reclassifyGap, ProvisionalDraftError } from '../../analysis/src/index.js';
import { DIMENSIONS } from '../../intake/src/rubric.mjs';
import { CHECKS, DEFAULT_METHOD, emptyProfile, merge3 } from '../src/index.js';
import { caseWith, draftModel, session, item, html, inventory, extract, BASE_FILES } from './fixtures.js';

const PASSAGE_ID = /@\w+:p\d+/;

test('default method works without any profile: sections, proposed conclusion, clean text, sources in panel', async () => {
  const { c, L } = await caseWith();
  const m = draftModel();
  const s = session(c, L, m);
  assert.deepEqual(s.profile, emptyProfile());
  const v = await s.generate('d1', { request: 'write the sentença on the merits' });
  assert.equal(v.docType.value, 'sentenca');
  assert.deepEqual(m.calls[0].system, DEFAULT_METHOD.instructions);
  assert.deepEqual(m.calls[0].style.instructions, []);
  assert.deepEqual(m.calls[0].style.examples, []);
  for (const h of ['## Relatório', '## Fundamentação', '## Dispositivo']) assert.ok(v.text.includes(h), h);
  assert.deepEqual(v.issues, []);
  assert.equal(v.requestedOutcome, null);
  assert.ok(v.conclusion.reasoning && v.conclusion.uses.length, 'proposes a reasoned conclusion');
  assert.doesNotMatch(v.text, PASSAGE_ID);
  assert.ok(v.panel.movedCitations.length > 0);
  assert.ok(v.panel.entries.every((e) => e.passages.length && e.verification === 'unverified'));
  assert.equal(v.state, 'conclusive');
  assert.equal((await s.presentConclusive('d1')).text, v.text);
});

test('without a requested outcome, a conclusion without reasoning fails the deterministic check', async () => {
  const { c, L } = await caseWith();
  const s = session(c, L, draftModel({ noReasoning: true }));
  const v = await s.generate('d1', { request: 'sentença' });
  assert.deepEqual(v.issues.map((i) => i.check), ['conclusion_reasoned']);
  await assert.rejects(s.presentConclusive('d1'), ProvisionalDraftError);
});

test('inferred document type is visible and editable', async () => {
  const { c, L } = await caseWith();
  const s = session(c, L, draftModel());
  const v = await s.generate('d1', { request: 'please decide the liminar request' });
  assert.deepEqual(v.docType, { value: 'decisao', basis: 'inferred', reason: 'request mentions "liminar"' });
  assert.deepEqual(await s.setDocType('d1', 'despacho'), { value: 'despacho', basis: 'user' });
  await assert.rejects(s.setDocType('d1', 'nope'), TypeError);
  const r = await s.regenerate('d1');
  assert.equal(r.docType.basis, 'user');
  assert.match(r.text, /^## Determinação\n/);
  assert.ok(!r.text.includes('## Relatório'));
});

test('requested outcome keeps contrary evidence, flags incompatibilities and blocks when they are not addressed', async () => {
  const items = [item('D1'), item('D3', { contentType: 'image/x-fake' }), item('D4')];
  const files = { ...BASE_FILES, D4: html('The operator states a leak occurred on day 2.') };
  const { c, L } = await caseWith({ items, files });
  const outcome = { text: 'Grant: the equipment leaked.', premises: [{ subject: 'leak', value: true }] };
  const noLeak = Object.values(L.findings).find((f) => f.subject === 'leak' && f.value === false).id;

  const bad = session(c, L, draftModel({ skipAddress: true }));
  const v = await bad.generate('d1', { request: 'sentença', requestedOutcome: outcome });
  assert.deepEqual(v.flags.map((f) => [f.finding, f.kind]).sort(), [['contra:leak', 'contradiction'], [noLeak, 'contrary']].sort());
  assert.deepEqual(v.issues.map((i) => i.check).sort(), ['contrary_addressed', 'contrary_addressed']);
  await assert.rejects(bad.presentConclusive('d1'), ProvisionalDraftError);

  const m = draftModel();
  const good = session(c, L, m);
  const g = await good.generate('d2', { request: 'sentença', requestedOutcome: outcome });
  assert.ok(m.calls[0].mustAddress.includes(noLeak) && m.calls[0].mustAddress.includes('contra:leak'));
  assert.ok(m.calls[0].evidence.findings.some((f) => f.id === noLeak), 'contrary finding is kept in the evidence');
  assert.equal(g.flags.length, 2, 'flags stay visible after they are addressed');
  assert.deepEqual(g.issues, []);
});

test('personal examples shape style only: they never enter the case evidence, and a copied fact is caught', async () => {
  const { c, L } = await caseWith();
  const profile = { instructions: ['Prefer short paragraphs.'], examples: [{ text: 'Sample act: the clerk Quarvel ordered payment of 98765 units.' }] };
  const m = draftModel();
  const s = session(c, L, m, { profile });
  await s.chat('What was the rated flow?');
  const v = await s.generate('d1', { request: 'sentença' });
  const [chat, draft] = m.calls;
  assert.equal(chat.evidence, draft.evidence, 'chat and draft share one case context');
  for (const p of [chat, draft]) {
    assert.doesNotMatch(JSON.stringify(p.evidence), /Quarvel|98765|short paragraphs/);
    assert.equal(p.style.examples[0].text, profile.examples[0].text);
    assert.match(p.style.use, /not case evidence/);
  }
  assert.deepEqual(v.issues, []);

  const leaky = session(c, L, draftModel({ leak: 'Quarvel paid 98765 units.' }), { profile });
  const lv = await leaky.generate('d2', { request: 'sentença' });
  assert.deepEqual(lv.issues.map((i) => i.message).sort(), ['"98765" comes from style material, not from the case', '"Quarvel" comes from style material, not from the case']);
  await assert.rejects(leaky.presentConclusive('d2'), ProvisionalDraftError);
});

test('a one-draft correction does not change future defaults; only an explicit future scope does', async () => {
  const { c, L } = await caseWith();
  const m = draftModel();
  const s = session(c, L, m);
  await s.generate('d1', { request: 'sentença' });
  assert.deepEqual(await s.correct('d1', 'Name the statute in full.'), { scope: 'draft', corrections: ['Name the statute in full.'] });
  await s.regenerate('d1');
  assert.deepEqual(m.calls[1].style.instructions, ['Name the statute in full.']);
  assert.deepEqual(s.profile, emptyProfile());
  await s.generate('d2', { request: 'sentença' });
  assert.deepEqual(m.calls[2].style.instructions, []);
  await assert.rejects(s.correct('d1', 'x', { scope: 'always' }), TypeError);

  const r = await s.correct('d2', 'Use numbered paragraphs.', { scope: 'future' });
  assert.deepEqual(r.profile.instructions, ['Use numbered paragraphs.']);
  await s.generate('d3', { request: 'sentença' });
  assert.deepEqual(m.calls[3].style.instructions, ['Use numbered paragraphs.']);
});

test('regeneration keeps manual edits, and shows a reviewable conflict when both sides changed a section', async () => {
  const { c, L } = await caseWith();
  const s = session(c, L, draftModel());
  const v1 = await s.generate('d1', { request: 'sentença' });
  const edited = v1.text.replace(/## Relatório\n[^\n]*/, '## Relatório\nMy own summary.');
  await s.saveEdit('d1', edited);

  const v2 = await s.regenerate('d1');
  assert.equal(v2.conflict, null);
  assert.match(v2.text, /## Relatório\nMy own summary\./);
  assert.match(v2.text, /revision 2\./, 'the regenerated section arrives');

  await s.saveEdit('d1', v2.text.replace('Order text, revision 2.', 'My own order.'));
  const v3 = await s.regenerate('d1');
  assert.equal(v3.source, 'user');
  assert.match(v3.text, /My own order\./, 'the manual edit is not overwritten');
  assert.deepEqual(v3.conflict.sections, [{ section: 'Dispositivo', base: 'Order text, revision 2.', user: 'My own order.', generated: 'Order text, revision 3.' }]);
  assert.equal(v3.state, 'provisional');
  await assert.rejects(s.presentConclusive('d1'), ProvisionalDraftError);
  await s.resolveConflict('d1', 'keep-user');
  const done = await s.presentConclusive('d1');
  assert.match(done.text, /My own order\./);
});

test('the #6 provisional-draft gate blocks conclusive presentation while it is closed; editing continues', async () => {
  const items = [item('D1'), item('D2', { state: 'restricted', detail: 'marked restricted in list' }), item('D3', { contentType: 'image/x-fake' })];
  const { c, L, files } = await caseWith({ items });
  const s = session(c, L, draftModel());
  const v = await s.generate('d1', { request: 'sentença' });
  assert.equal(v.state, 'provisional');
  assert.equal(v.label, 'PROVISIONAL');
  assert.equal(v.editable, true);
  assert.ok(v.reasons.some((r) => r.includes('restricted')));
  await assert.rejects(s.presentConclusive('d1'), ProvisionalDraftError);
  await s.saveEdit('d1', `${v.text}\nExtra line.`);

  const gap = Object.values(L.gaps).find((g) => g.reason === 'restricted');
  reclassifyGap(L, gap.id, { actor: 'human', by: 'reviewer-1', impact: 'dispensable', reason: 'not relevant to the pump question', sources: [Object.keys(L.passages)[0]] });
  assert.match((await s.presentConclusive('d1')).text, /Extra line\./);

  // A late attachment makes the draft stale: closed again until regenerated on the new context.
  const more = [...items, item('D1A', { kind: 'attachment', parentId: 'D1' })];
  const inv = inventory(more);
  ingest(L, inv, await extract(inv, { ...files, D1A: html('Seal kit replaced at 2000 hours.') }));
  assert.equal((await s.view('d1')).state, 'stale');
  await assert.rejects(s.presentConclusive('d1'), ProvisionalDraftError);
});

test('chat replies are clean text with sources in the panel, stored in the case conversation', async () => {
  const { c, L } = await caseWith();
  const s = session(c, L, draftModel());
  const r = await s.chat('What was the rated flow?');
  assert.doesNotMatch(r.text, PASSAGE_ID);
  assert.equal(r.sources.movedCitations.length, 1);
  assert.equal(r.sources.entries[0].ref, 'reply');
  assert.equal((await c.get('conversation', 'main')).messages.length, 2);
});

test('deterministic checks map to #3 rubric dimensions; merge3 merges disjoint edits', () => {
  for (const ch of CHECKS) assert.ok(DIMENSIONS.includes(ch.dimension), ch.id);
  const base = '## A\none\n## B\ntwo';
  assert.deepEqual(merge3(base, '## A\nmine\n## B\ntwo', '## A\none\n## B\nnew'), { ok: true, text: '## A\nmine\n## B\nnew' });
  assert.equal(merge3(base, '## A\nmine\n## B\ntwo', '## C\nother').ok, false);
});

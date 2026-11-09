import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyLedger, ingest, analyze, coverage, save, load, summary, openGaps, reclassifyGap, registerDraft, draftState, assertConclusive, GateError, ProvisionalDraftError } from '../src/index.js';
import { BASE_FILES, baseItems, inventory, item, html, scan, extract, openCase, fakeModel } from './fixtures.js';

async function setup({ items = baseItems(), files = BASE_FILES, model = fakeModel() } = {}) {
  const c = await openCase();
  const L = emptyLedger();
  const inv = inventory(items);
  ingest(L, inv, await extract(inv, files));
  await analyze(c, L, model.fn);
  return { c, L, model };
}
const restrictedGap = (L) => Object.values(L.gaps).find((g) => g.reason === 'restricted');
const firstPassage = (L, docId) => Object.keys(L.passages).find((id) => id.startsWith(`${docId}@`));

test('ledger reconciles a synthetic inventory: every readable portion has a completed call, the rest is a gap', async () => {
  const { c, L, model } = await setup();
  const cov = await coverage(c, L);
  assert.deepEqual(cov, { ok: true, portions: 2, analyzed: 2, unprocessed: [] });
  assert.deepEqual(Object.keys(L.portions).sort(), ['D1@1:p1', 'D3@1:p1']);
  for (const p of Object.values(L.portions)) assert.equal((await c.get('call', p.call.stepId)).status, 'done');
  assert.equal(L.portions['D3@1:p1'].method, 'ocr:fake-ocr-1');
  assert.equal(restrictedGap(L).impact, 'unknown');
  // Re-running analysis sends no call twice, also from a ledger reloaded from the store.
  await save(c, L);
  const again = await load(c);
  assert.deepEqual(await analyze(c, again, model.fn), []);
  assert.equal(model.calls.length, 2);
  // A ledger entry without its call record in the store is not evidence.
  await c.delete('call', L.portions['D1@1:p1'].call.stepId);
  assert.deepEqual((await coverage(c, L)).unprocessed, ['D1@1:p1']);
});

test('excluded text becomes a gap, not a silent hole, and never reaches the model call', async () => {
  const c = await openCase();
  const L = emptyLedger();
  const inv = inventory(baseItems());
  const model = fakeModel();
  ingest(L, inv, await extract(inv, BASE_FILES), { exclude: (p) => (p.text.includes('Inlet') ? 'policy' : null) });
  await analyze(c, L, model.fn);
  assert.ok(!model.calls.flatMap((x) => x.passages).some((id) => id.endsWith(':45-78') || L.passages[id]?.text.includes('Inlet')));
  assert.ok(Object.values(L.gaps).some((g) => g.reason === 'excluded_from_transmission' && g.docId === 'D1'));
});

test('late attachment and a new version invalidate dependent findings and mark the stale draft', async () => {
  const model = fakeModel({ extra: [{ docId: 'D3', assertion: { class: 'unknown', text: 'No maintenance record in the case', decisive: false } }] });
  const { c, L } = await setup({ model });
  const all = summary(L);
  const absence = all.unknown[0];
  const flow = all.fact.find((f) => f.subject === 'pump.flow');
  registerDraft(L, 'draft-1', [absence.id, flow.id]);
  assert.equal(draftState(L, 'draft-1').state, 'provisional'); // restricted D2 is still open

  const items = [...baseItems(), item('D1A', { kind: 'attachment', parentId: 'D1' })];
  const files = { ...BASE_FILES, D1A: html('Maintenance record: seal kit replaced at 2000 hours.') };
  const inv = inventory(items);
  const ev = ingest(L, inv, await extract(inv, files));
  assert.deepEqual(ev.added, ['D1A@1:p1']);
  assert.ok(ev.inventoryChanged);
  assert.deepEqual(ev.staleFindings, [absence.id]);
  assert.equal(L.findings[absence.id].stale.reason, 'inventory changed');
  assert.equal(L.findings[flow.id].stale, null); // its source did not change
  assert.deepEqual(ev.staleDrafts, ['draft-1']);
  const s = draftState(L, 'draft-1');
  assert.equal(s.state, 'stale');
  assert.ok(s.reasons.includes('not analyzed: D1A@1:p1'));
  assert.equal((await coverage(c, L)).ok, false);
  await analyze(c, L, model.fn);
  assert.equal((await coverage(c, L)).ok, true);

  // D1 version 2 replaces version 1: findings that cite version 1 go stale; new ones cite version 2.
  const inv2 = inventory(items.map((i) => (i.id === 'D1' ? { ...i, version: '2' } : i)));
  const ev2 = ingest(L, inv2, await extract(inv2, files));
  assert.ok(ev2.changed.includes('D1@1:p1') && ev2.added.includes('D1@2:p1'));
  assert.equal(L.findings[flow.id].stale.reason, 'source changed');
  await analyze(c, L, model.fn);
  const current = summary(L).fact.filter((f) => f.subject === 'pump.flow' && !f.stale);
  assert.equal(current.length, 1);
  assert.match(current[0].support[0], /^D1@2:p1:/);
});

test('an indispensable or unknown-impact gap blocks a conclusive draft but not analysis or editing', async () => {
  const { c, L } = await setup();
  const flow = summary(L).fact.find((f) => f.subject === 'pump.flow');
  registerDraft(L, 'draft-1', [flow.id]);
  const gap = restrictedGap(L);
  assert.equal(draftState(L, 'draft-1').state, 'provisional');
  assert.ok(draftState(L, 'draft-1').editable);
  assert.throws(() => assertConclusive(L, 'draft-1'), ProvisionalDraftError);
  // Editing continues on the #7 draft record while the gate holds.
  await c.saveUserEdit('draft-1', 'edited text', 0);
  assert.equal((await c.getDraft('draft-1')).current, 'edited text');
  // The model may raise the impact, never clear it.
  reclassifyGap(L, gap.id, { actor: 'model', impact: 'indispensable', reason: 'may hold the inspection report' });
  assert.throws(() => reclassifyGap(L, gap.id, { actor: 'model', by: 'model', impact: 'dispensable', reason: 'not needed', sources: [firstPassage(L, 'D1')] }), GateError);
  assert.equal(L.gaps[gap.id].impact, 'indispensable');
  assert.throws(() => assertConclusive(L, 'draft-1'), /gap .*restricted \(indispensable\)/);
});

test('human reclassification records reason and sources; it needs both, and a source change revokes it', async () => {
  const { L } = await setup();
  const flow = summary(L).fact.find((f) => f.subject === 'pump.flow');
  registerDraft(L, 'draft-1', [flow.id]);
  const gap = restrictedGap(L);
  const src = firstPassage(L, 'D3');
  assert.throws(() => reclassifyGap(L, gap.id, { actor: 'human', by: 'reviewer-1', impact: 'dispensable', reason: ' ', sources: [src] }), /reason/);
  assert.throws(() => reclassifyGap(L, gap.id, { actor: 'human', by: 'reviewer-1', impact: 'dispensable', reason: 'covered elsewhere' }), /source/);
  assert.throws(() => reclassifyGap(L, gap.id, { actor: 'human', by: 'reviewer-1', impact: 'dispensable', reason: 'x', sources: ['D9@1:p1:0-5'] }), /not a current passage/);
  const rec = reclassifyGap(L, gap.id, { actor: 'human', by: 'reviewer-1', impact: 'dispensable', reason: 'The inspection scan covers the same point.', sources: [src] }, 42);
  assert.deepEqual(rec.sources, [{ passage: src, portion: 'D3@1:p1' }]);
  assert.equal(rec.at, 42);
  assert.deepEqual(L.gaps[gap.id].history.at(-1), rec);
  assert.equal(openGaps(L).length, 0);
  assert.equal(assertConclusive(L, 'draft-1').state, 'conclusive');

  // A new OCR run changes the cited scan text: the reclassification is revoked and the gate closes.
  const inv = inventory(baseItems());
  ingest(L, inv, await extract(inv, { ...BASE_FILES, D3: scan(['Inspection on day 4 found no leak.', 0.95]) }));
  assert.equal(L.gaps[gap.id].impact, 'unknown');
  assert.equal(L.gaps[gap.id].history.at(-1).revoked.reason, 'a cited source changed');
  assert.notEqual(draftState(L, 'draft-1').state, 'conclusive');
});

test('a low-confidence OCR passage cannot support a decisive fact', async () => {
  const items = [...baseItems(), item('D4', { contentType: 'image/x-fake' })];
  const files = { ...BASE_FILES, D4: scan(['Second plate says rated flow 25 litres per minute.', 0.41]) };
  const { L } = await setup({ items, files });
  const weak = summary(L).fact.find((f) => f.value === 25);
  assert.equal(weak.supported, false);
  assert.deepEqual(weak.support, []);
  assert.equal(weak.rejected[0].reason, 'low_confidence');
  assert.ok(openGaps(L).some((g) => g.reason === `unsupported_decisive:${weak.id}`));
  // The model cannot cite a passage it was not given.
  const c = await openCase();
  const L2 = emptyLedger();
  const inv = inventory(baseItems());
  ingest(L2, inv, await extract(inv, BASE_FILES));
  await analyze(c, L2, fakeModel({ extra: [{ docId: 'D3', assertion: { class: 'fact', decisive: true, text: 'x', support: [firstPassage(L2, 'D1')] } }] }).fn);
  const forged = Object.values(L2.findings).find((f) => f.text === 'x');
  assert.equal(forged.supported, false);
  assert.equal(forged.rejected[0].reason, 'not_in_call_input');
});

test('a decisive legal conclusion with no cited source is unsupported and opens a gap', async () => {
  // PR #21 review probe: { class: 'legal_conclusion', decisive: true } with no citation was
  // supported and opened no gap. The same holds for any other decisive class. A non-decisive
  // assertion with no citation stays supported.
  const items = [item('D1'), item('D3', { contentType: 'image/x-fake' })];
  const { L } = await setup({
    items,
    model: fakeModel({ extra: [
      { docId: 'D1', assertion: { class: 'legal_conclusion', decisive: true, text: 'The recorded limit is met' } },
      { docId: 'D1', assertion: { class: 'unknown', decisive: true, text: 'Hours since service are not in the record' } },
      { docId: 'D1', assertion: { class: 'fact', decisive: false, text: 'Noted in passing' } },
    ] }),
  });
  const row = (f) => [f.class, f.decisive, f.supported, f.support.length];
  const lc = summary(L).legal_conclusion.find((f) => f.text === 'The recorded limit is met');
  const unk = summary(L).unknown.find((f) => f.text === 'Hours since service are not in the record');
  const note = Object.values(L.findings).find((f) => f.text === 'Noted in passing');
  assert.deepEqual(row(lc), ['legal_conclusion', true, false, 0]);
  assert.ok(lc.issues.includes('no admissible source for a decisive assertion'));
  assert.deepEqual(row(unk), ['unknown', true, false, 0]);
  assert.deepEqual(row(note), ['fact', false, true, 0]);
  const findingGaps = openGaps(L).filter((g) => g.source === 'finding').map((g) => g.reason).sort();
  assert.deepEqual(findingGaps, [`unsupported_decisive:${lc.id}`, `unsupported_decisive:${unk.id}`].sort());
  registerDraft(L, 'draft-probe', [lc.id]);
  const state = draftState(L, 'draft-probe');
  assert.equal(state.state, 'provisional');
  assert.ok(state.editable);
  assert.ok(state.reasons.some((r) => r.includes(`unsupported_decisive:${lc.id}`)));
  assert.throws(() => assertConclusive(L, 'draft-probe'), ProvisionalDraftError);

  // The same conclusion citing an admissible passage from the call input is supported.
  const c2 = await openCase();
  const L2 = emptyLedger();
  const inv = inventory(items);
  ingest(L2, inv, await extract(inv, BASE_FILES));
  const pid = firstPassage(L2, 'D1');
  await analyze(c2, L2, fakeModel({ extra: [
    { docId: 'D1', assertion: { class: 'legal_conclusion', decisive: true, text: 'The recorded limit is met', support: [pid] } },
  ] }).fn);
  const cited = summary(L2).legal_conclusion[0];
  assert.deepEqual(row(cited), ['legal_conclusion', true, true, 1]);
  assert.deepEqual(cited.support, [pid]);
  assert.equal(openGaps(L2).filter((g) => g.source === 'finding').length, 0);
  registerDraft(L2, 'draft-cited', [cited.id]);
  assert.equal(assertConclusive(L2, 'draft-cited').state, 'conclusive');
});

test('contradictory evidence from a late scan surfaces with both sides, even when one side is weak', async () => {
  const { c, L, model } = await setup();
  assert.equal(summary(L).contradiction.length, 0);
  const items = [...baseItems(), item('D5', { contentType: 'image/x-fake' }), item('D6', { contentType: 'image/x-fake' })];
  const files = {
    ...BASE_FILES,
    D5: scan(['Test bench: rated flow 25 litres per minute.', 0.93]),
    D6: scan(['The operator states the seal was leaking.', 0.5]),
  };
  const inv = inventory(items);
  ingest(L, inv, await extract(inv, files));
  await analyze(c, L, model.fn);
  const contra = summary(L).contradiction;
  const flow = contra.find((f) => f.subject === 'pump.flow');
  assert.deepEqual(flow.sides.map((s) => s.value).sort(), [25, 40]);
  assert.ok(flow.supported && flow.decisive);
  assert.ok(flow.support.some((id) => id.startsWith('D1@')) && flow.support.some((id) => id.startsWith('D5@')));
  const leak = contra.find((f) => f.subject === 'leak');
  assert.equal(leak.supported, false); // the allegation's only source is low-confidence OCR
  assert.ok(openGaps(L).some((g) => g.reason === `unsupported_decisive:${leak.id}`));
});

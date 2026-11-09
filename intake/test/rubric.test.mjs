import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { score, DIMENSIONS } from '../src/rubric.mjs';

const pending = () => JSON.parse(readFileSync(new URL('./fixtures/sheet-pending.json', import.meta.url)));
const full = () => { const s = pending(); s.scores.method_fidelity = { status: 'scored', score: 3 }; return s; };

test('six separate dimensions', () => assert.deepEqual(DIMENSIONS, ['factual_support', 'contradictions', 'gaps', 'method_fidelity', 'ocr_quality', 'draft_usefulness']));

test('reports each dimension separately, no aggregate by default', () => {
  const r = score(pending());
  assert.equal(r.dimensions.factual_support, 4);
  assert.equal(r.dimensions.method_fidelity, 'pending');
  assert.equal(r.dimensions.ocr_quality, 'not-applicable');
  assert.ok(!('aggregate' in r));
});

test('refuses an aggregate while a dimension is pending', () => {
  assert.throws(() => score(pending(), { aggregate: true }), /refused: .*method_fidelity/);
});

test('refuses a sheet with a missing dimension', () => {
  const s = full(); delete s.scores.gaps;
  assert.throws(() => score(s, { aggregate: true }), /missing gaps/);
});

test('aggregate is the weakest dimension when all are present', () => {
  const r = score(full(), { aggregate: true });
  assert.equal(r.aggregate, 3);
  assert.equal(r.pass, true);
});

test('an invented decisive fact fails the run whatever the other scores', () => {
  const s = full(); s.scores.factual_support.invented_decisive_facts = 1;
  assert.equal(score(s, { aggregate: true }).pass, false);
});

test('rejects inconsistent dimensions', () => {
  const s = full(); s.scores.gaps = { status: 'scored' };
  assert.throws(() => score(s), /scored needs score/);
  const t = full(); t.scores.gaps = { status: 'scored', score: 5 };
  assert.throws(() => score(t), /<= 4/);
  const u = full(); u.scores.contradictions = { status: 'scored', score: 2, found: 3, expected: 2 };
  assert.throws(() => score(u), /found > expected/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BatchQueue, ComparisonError, buildComparison } from '../src/index.js';
import { ALPHA, BETA, GAMMA, loadQueue, resultFor } from './fixtures.js';

async function finished() {
  const { selection, auth } = loadQueue([ALPHA, BETA, GAMMA], null);
  const queue = new BatchQueue({ runner: async (job) => resultFor(job.caseId) });
  queue.load(selection, auth);
  await queue.run();
  return queue;
}

test('a comparison cites each case source and does not change drafts', async () => {
  const queue = await finished();
  const before = [ALPHA, BETA, GAMMA].map((id) => queue.report(id).draft);
  const context = queue.compare('how do the fixtures differ?');
  const after = [ALPHA, BETA, GAMMA].map((id) => queue.report(id).draft);
  assert.deepEqual(after, before);
  assert.equal(context.kind, 'comparison');
  assert.equal(Object.hasOwn(context, 'draft'), false);
  assert.deepEqual(context.citations, [
    { caseId: ALPHA, sourceId: 'src-fixture-alpha', locator: 'p1' },
    { caseId: BETA, sourceId: 'src-fixture-beta', locator: 'p1' },
    { caseId: GAMMA, sourceId: 'src-fixture-gamma', locator: 'p1' },
  ]);
  const encoded = JSON.stringify(context);
  for (const draft of before) assert.equal(encoded.includes(draft), false);
  assert.equal(queue.comparisons.length, 1);
  assert.equal(queue.report(ALPHA).draft, 'draft:fixture-alpha');
});

test('a one-case comparison does not cite the other cases', async () => {
  const queue = await finished();
  const context = queue.compare('only alpha', [ALPHA]);
  assert.deepEqual(context.citations.map((cite) => cite.caseId), [ALPHA]);
  assert.equal(JSON.stringify(context).includes('src-fixture-beta'), false);
});

test('a comparison cannot be asked to rewrite drafts', async () => {
  const queue = await finished();
  const draft = queue.report(ALPHA).draft;
  assert.throws(() => queue.compare('rewrite', [ALPHA, BETA], { applyToDrafts: true }), (err) => err instanceof ComparisonError && err.code === 'comparisons_do_not_change_drafts');
  assert.equal(queue.report(ALPHA).draft, draft);
  assert.equal(queue.report(BETA).draft, 'draft:fixture-beta');
  assert.equal(queue.comparisons.length, 0);
});

test('a citation that names another case source is rejected', () => {
  const reports = new Map([
    [ALPHA, { status: 'succeeded', evidence: [{ caseId: BETA, sourceId: 'src-fixture-beta', locator: 'p1' }] }],
  ]);
  assert.throws(() => buildComparison(reports, { question: 'cross', caseIds: [ALPHA] }), (err) => err.code === 'foreign_source');
});

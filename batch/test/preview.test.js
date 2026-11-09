import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BatchQueue, MAX_BATCH, SelectionError, confirmSelection, createAuthorizer, selectByLabel, selectByNaturalLanguage, selectManual } from '../src/index.js';
import { ALPHA, BETA, CATALOG, GAMMA, confirmIds, resultFor } from './fixtures.js';

const idsOf = (selection) => selection.included.map((row) => row.id);

test('manual included preview equals the confirmed selection and the queue', async () => {
  const preview = selectManual(CATALOG, [ALPHA, BETA, GAMMA]);
  assert.equal(preview.status, 'preview');
  assert.deepEqual(idsOf(preview), preview.caseIds);
  assert.deepEqual(preview.caseIds, [ALPHA, BETA, GAMMA]);
  assert.deepEqual(preview.included.map((row) => row.title), ['Fixture alpha', 'Fixture beta', 'Fixture gamma']);

  const confirmed = confirmSelection(preview, preview.caseIds);
  assert.equal(confirmed.status, 'confirmed');
  assert.deepEqual(idsOf(confirmed), confirmed.caseIds);
  assert.deepEqual(confirmed.caseIds, preview.caseIds);

  const subset = confirmSelection(preview, [GAMMA, ALPHA]);
  assert.deepEqual(idsOf(subset), subset.caseIds);
  assert.deepEqual(subset.caseIds, [GAMMA, ALPHA]);

  const authorize = createAuthorizer();
  const { auth } = authorize({ provider: 'mock-plan', data: 'synthetic-batch', caseIds: confirmed.caseIds });
  const queue = new BatchQueue({ runner: async (job) => resultFor(job.caseId) });
  queue.load(confirmed, auth);
  const progress = await queue.run();
  assert.deepEqual(progress.included.map((row) => row.id), confirmed.caseIds);
  assert.deepEqual(progress.cases.map((row) => row.id), confirmed.caseIds);
  assert.deepEqual(progress.cases.map((row) => row.status), ['succeeded', 'succeeded', 'succeeded']);
});

test('label and natural-language selection never add an unconfirmed case', () => {
  const label = selectByLabel(CATALOG, ['batch-demo', 'widget']);
  const spoken = selectByNaturalLanguage(CATALOG, 'widget pump');
  assert.equal(label.status, 'preview');
  assert.equal(spoken.status, 'preview');
  assert.deepEqual(label.caseIds, [ALPHA, BETA]);
  assert.deepEqual(spoken.caseIds, [ALPHA]);
  assert.ok(!label.caseIds.includes(GAMMA));
  assert.ok(!spoken.caseIds.includes(BETA));

  assert.throws(() => confirmSelection(label, [...label.caseIds, GAMMA]), (err) => err instanceof SelectionError && err.code === 'unconfirmed_case');
  assert.throws(() => confirmSelection(spoken, [BETA]), (err) => err instanceof SelectionError && err.code === 'unconfirmed_case');
  assert.throws(() => new BatchQueue({ runner: async () => {} }).load(label, { id: 'auth-x', provider: 'mock-plan', data: 'synthetic-batch', caseIds: label.caseIds }), (err) => err instanceof SelectionError && err.code === 'not_confirmed');

  const confirmed = confirmSelection(label, [BETA]);
  assert.deepEqual(confirmed.caseIds, [BETA]);
  assert.deepEqual(idsOf(confirmed), confirmed.caseIds);
});

test('an over-limit match stays visible and includes nothing until the user narrows it', () => {
  const wide = selectByLabel(CATALOG, ['batch-demo']);
  assert.equal(wide.candidates.length, 6);
  assert.equal(wide.status, 'needs_narrowing');
  assert.deepEqual(wide.included, []);
  assert.deepEqual(wide.caseIds, []);
  assert.ok(wide.candidates.some((row) => row.id === 'fixture-eta'));
  assert.throws(() => confirmSelection(wide, wide.candidates.map((row) => row.id)), (err) => err instanceof SelectionError && err.code === 'batch_limit');

  const kept = wide.candidates.slice(0, MAX_BATCH).map((row) => row.id);
  const confirmed = confirmSelection(wide, kept);
  assert.equal(confirmed.status, 'confirmed');
  assert.deepEqual(idsOf(confirmed), confirmed.caseIds);
  assert.deepEqual(confirmed.caseIds, kept);
  assert.ok(!confirmed.caseIds.includes('fixture-eta'));
});

test('manual selection rejects unknown, duplicate, and over-limit ids', () => {
  assert.throws(() => selectManual(CATALOG, ['not-a-case']), (err) => err.code === 'unknown_case');
  assert.throws(() => selectManual(CATALOG, [ALPHA, ALPHA]), (err) => err.code === 'duplicate_case');
  assert.throws(() => selectManual(CATALOG, CATALOG.map((row) => row.id)), (err) => err.code === 'batch_limit');
  assert.throws(() => confirmSelection(confirmIds([ALPHA]), [ALPHA]), (err) => err.code === 'already_confirmed');
});

test('one authorization covers the batch until the scope changes', async () => {
  const selection = confirmIds([ALPHA, BETA, GAMMA]);
  const authorize = createAuthorizer();
  const first = authorize({ provider: 'mock-plan', data: 'synthetic-batch', caseIds: selection.caseIds });
  assert.equal(first.prompted, true);
  assert.equal(first.auth.prompts, 1);

  const same = authorize({
    provider: 'mock-plan',
    data: 'synthetic-batch',
    caseIds: [...selection.caseIds].reverse(),
    previous: first.auth,
  });
  assert.equal(same.prompted, false);
  assert.equal(same.auth, first.auth);

  assert.throws(
    () => authorize({ provider: 'mock-plan', data: 'other-scope', caseIds: selection.caseIds, previous: first.auth }),
    (err) => err.code === 'renew_required',
  );
  const renewed = authorize({
    provider: 'other-provider',
    data: 'synthetic-batch',
    caseIds: selection.caseIds,
    previous: first.auth,
    renew: true,
  });
  assert.equal(renewed.prompted, true);
  assert.equal(renewed.auth.prompts, 2);
  assert.notEqual(renewed.auth.id, first.auth.id);

  const calls = [];
  const queue = new BatchQueue({
    runner: async (job) => {
      calls.push(job);
      return resultFor(job.caseId);
    },
  });
  queue.load(selection, first.auth);
  const progress = await queue.run();
  assert.equal(progress.prompts, 1);
  assert.equal(progress.authId, first.auth.id);
  assert.deepEqual(calls.map((job) => job.authId), [first.auth.id, first.auth.id, first.auth.id]);
  assert.equal(queue.report(ALPHA).permissions.data, 'synthetic-batch');
  assert.equal(queue.report(BETA).permissions.data, 'synthetic-batch');
  assert.notEqual(queue.report(ALPHA).permissions, queue.report(BETA).permissions);
});

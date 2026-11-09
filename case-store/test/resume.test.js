import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASE_A, env } from './fixtures.js';
import { StepFailedError } from '../src/index.js';

test('worker restart: completed step is not repeated, manual edit survives', async () => {
  const { make } = env();
  let calls = 0;
  const analyze = async () => (++calls, 'generated v1');

  const a1 = await make().openCase(CASE_A);
  const text = await a1.runStep('analysis-1', analyze);
  await a1.addGeneratedRevision('d1', text, { stepId: 'analysis-1' });
  await a1.saveUserEdit('d1', 'manual edit');

  // Worker restart: new store instance, same persistent backend. The resume path replays steps.
  const a2 = await make().openCase(CASE_A);
  const again = await a2.runStep('analysis-1', analyze);
  await a2.addGeneratedRevision('d1', again, { stepId: 'analysis-1' });

  assert.equal(calls, 1);
  const d = await a2.getDraft('d1');
  assert.equal(d.current, 'manual edit');
  assert.equal(d.source, 'user');
  assert.equal(d.generated.length, 1);
  assert.equal(d.conflict, null);
});

test('browser restart mid-step: retry budget and idempotency key persist', async () => {
  const { make } = env();
  const keys = [];
  const a1 = await make().openCase(CASE_A);
  await a1.saveUserEdit('d1', 'manual edit before crash');
  // The worker dies during the call: fn never settles, the store instance is dropped.
  a1.runStep('analysis-2', ({ idempotencyKey }) => (keys.push(idempotencyKey), new Promise(() => {})), { maxAttempts: 2 });
  await new Promise((r) => setImmediate(r));

  const a2 = await make().openCase(CASE_A);
  assert.equal((await a2.get('call', 'analysis-2')).attempts, 1);
  const out = await a2.runStep('analysis-2', async ({ idempotencyKey }) => (keys.push(idempotencyKey), 'v2'), { maxAttempts: 2 });
  assert.equal(out, 'v2');
  assert.deepEqual(keys, [`${CASE_A}:analysis-2`, `${CASE_A}:analysis-2`]);
  assert.equal((await a2.getDraft('d1')).current, 'manual edit before crash');
});

test('retries are bounded and stop at a failed state', async () => {
  const { make } = env();
  const a = await make().openCase(CASE_A);
  let calls = 0;
  const flaky = async () => {
    calls++;
    throw new Error('network reset');
  };
  await assert.rejects(a.runStep('s', flaky, { maxAttempts: 3 }), StepFailedError);
  await assert.rejects(a.runStep('s', flaky, { maxAttempts: 3 }), StepFailedError);
  assert.equal(calls, 3);
  await a.resetStep('s');
  assert.equal(await a.runStep('s', async () => 'ok'), 'ok');
});

test('a late generated revision surfaces a conflict and never overwrites the edit', async () => {
  const { make } = env();
  const a = await make().openCase(CASE_A);
  await a.addGeneratedRevision('d1', 'gen 1');
  await a.saveUserEdit('d1', 'manual');
  const { conflict } = await a.addGeneratedRevision('d1', 'gen 2');
  assert.deepEqual(conflict, { userBasedOn: 1, generatedRev: 2 });
  assert.equal((await a.getDraft('d1')).current, 'manual');

  await a.resolveConflict('d1', 'keep-user');
  let d = await a.getDraft('d1');
  assert.equal(d.conflict, null);
  assert.equal(d.current, 'manual');

  await a.addGeneratedRevision('d1', 'gen 3');
  await a.resolveConflict('d1', 'take-generated');
  d = await a.getDraft('d1');
  assert.equal(d.current, 'gen 3');
  assert.equal(d.source, 'generated');
});

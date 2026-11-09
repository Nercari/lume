import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BatchQueue } from '../src/index.js';
import { ALPHA, BETA, GAMMA, fail, loadQueue, resultFor } from './fixtures.js';

function start(ids, runner, queueOptions = {}) {
  const { selection, auth } = loadQueue(ids, runner);
  const queue = new BatchQueue({ runner, ...queueOptions });
  queue.load(selection, auth);
  return queue;
}

test('a terminal case failure does not stop the other cases', async () => {
  const calls = [];
  const queue = start([ALPHA, BETA, GAMMA], async (job) => {
    calls.push(job.caseId);
    if (job.caseId === ALPHA) throw fail('case_failed', { retryable: false });
    return resultFor(job.caseId);
  });
  const progress = await queue.run();
  assert.equal(progress.status, 'done');
  assert.deepEqual(calls, [ALPHA, BETA, GAMMA]);
  assert.equal(queue.report(ALPHA).status, 'failed');
  assert.equal(queue.report(ALPHA).attempts, 1);
  assert.equal(queue.report(BETA).status, 'succeeded');
  assert.equal(queue.report(GAMMA).status, 'succeeded');
  assert.equal(queue.report(BETA).error, null);
});

test('retries stay on the failing case and stop at the attempt bound', async () => {
  const calls = [];
  const queue = start([ALPHA, BETA], async (job) => {
    calls.push(`${job.caseId}:${job.attempt}`);
    if (job.caseId === ALPHA && job.attempt < 3) throw fail('case_failed');
    return resultFor(job.caseId);
  }, { maxAttempts: 3 });
  await queue.run();
  assert.deepEqual(calls, [`${ALPHA}:1`, `${ALPHA}:2`, `${ALPHA}:3`, `${BETA}:1`]);
  assert.equal(queue.report(ALPHA).status, 'succeeded');
  assert.equal(queue.report(ALPHA).attempts, 3);
  assert.equal(queue.report(BETA).attempts, 1);

  const exhausted = start([ALPHA, BETA], async (job) => {
    if (job.caseId === ALPHA) throw fail('case_failed');
    return resultFor(job.caseId);
  }, { maxAttempts: 3 });
  await exhausted.run();
  assert.equal(exhausted.report(ALPHA).status, 'failed');
  assert.equal(exhausted.report(ALPHA).attempts, 3);
  assert.equal(exhausted.report(BETA).status, 'succeeded');
  assert.equal(exhausted.report(BETA).attempts, 1);
});

test('shared auth and quota pauses the queue and resume does not repeat finished work', async () => {
  let blocked = false;
  const calls = [];
  const queue = start([ALPHA, BETA, GAMMA], async (job) => {
    calls.push(job.idempotencyKey);
    if (job.caseId === ALPHA) blocked = true;
    return resultFor(job.caseId);
  }, { shared: () => (blocked ? 'quota_exhausted' : null) });

  const paused = await queue.run();
  assert.equal(paused.status, 'paused');
  assert.equal(paused.pause.reason, 'quota_exhausted');
  assert.equal(queue.report(ALPHA).status, 'succeeded');
  assert.equal(queue.report(BETA).status, 'pending');
  assert.equal(queue.report(BETA).attempts, 0);
  assert.equal(queue.report(GAMMA).status, 'pending');
  assert.deepEqual(calls, [`auth-1:${ALPHA}:1`]);

  const still = await queue.resume();
  assert.equal(still.status, 'paused');
  assert.deepEqual(calls, [`auth-1:${ALPHA}:1`]);

  blocked = false;
  const done = await queue.resume();
  assert.equal(done.status, 'done');
  assert.deepEqual(calls, [`auth-1:${ALPHA}:1`, `auth-1:${BETA}:1`, `auth-1:${GAMMA}:1`]);
  assert.equal(queue.report(ALPHA).attempts, 1);
});

test('an auth failure inside a case pauses without consuming that attempt', async () => {
  const calls = [];
  let deny = true;
  const queue = start([ALPHA, BETA], async (job) => {
    calls.push(job.caseId);
    if (job.caseId === BETA && deny) throw fail('auth_expired', { status: 401 });
    return resultFor(job.caseId);
  });
  const paused = await queue.run();
  assert.equal(paused.status, 'paused');
  assert.equal(paused.pause.reason, 'auth_expired');
  assert.equal(queue.report(ALPHA).status, 'succeeded');
  assert.equal(queue.report(BETA).status, 'pending');
  assert.equal(queue.report(BETA).attempts, 0);
  assert.equal(queue.report(BETA).error, null);

  deny = false;
  await queue.resume();
  assert.deepEqual(calls, [ALPHA, BETA, BETA]);
  assert.equal(queue.report(BETA).status, 'succeeded');
  assert.equal(queue.report(BETA).attempts, 1);
  assert.equal(queue.report(ALPHA).attempts, 1);
});

test('authenticated reads do not start without a browser session', async () => {
  let open = false;
  const calls = [];
  const queue = start([ALPHA], async (job) => {
    calls.push(job.caseId);
    return resultFor(job.caseId);
  }, { browserSession: () => open });
  const paused = await queue.run();
  assert.equal(paused.status, 'paused');
  assert.equal(paused.pause.reason, 'pje_session_unavailable');
  assert.deepEqual(calls, []);
  open = true;
  const done = await queue.resume();
  assert.equal(done.status, 'done');
  assert.deepEqual(calls, [ALPHA]);
});

test('cancel leaves unfinished cases unstarted and resume runs them once', async () => {
  const calls = [];
  const queue = start([ALPHA, BETA, GAMMA], async (job) => {
    calls.push(job.caseId);
    if (job.caseId === ALPHA) queue.cancel();
    return resultFor(job.caseId);
  });
  const cancelled = await queue.run();
  assert.equal(cancelled.status, 'cancelled');
  assert.equal(queue.report(ALPHA).status, 'succeeded');
  assert.equal(queue.report(BETA).status, 'cancelled');
  assert.equal(queue.report(GAMMA).status, 'cancelled');
  assert.deepEqual(calls, [ALPHA]);

  const done = await queue.resume();
  assert.equal(done.status, 'done');
  assert.deepEqual(calls, [ALPHA, BETA, GAMMA]);
  assert.deepEqual([ALPHA, BETA, GAMMA].map((id) => queue.report(id).attempts), [1, 1, 1]);
  assert.deepEqual(calls.filter((id) => id === ALPHA), [ALPHA]);
});

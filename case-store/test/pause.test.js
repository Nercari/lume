import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASE_A, CASE_B, env } from './fixtures.js';
import { PausedError } from '../src/index.js';

for (const [label, err, reason] of [
  ['auth expiry (401)', Object.assign(new Error('unauthorized'), { status: 401 }), 'auth_expired'],
  ['quota (usage limit code)', Object.assign(new Error('limit'), { code: 'subscription_sharing_usage_limit_exceeded' }), 'quota_exhausted'],
]) {
  test(`${label} pauses after one attempt and resumes after a restart`, async () => {
    const { make } = env();
    let calls = 0;
    const a = await make().openCase(CASE_A);
    const fail = async () => {
      calls++;
      throw err;
    };
    await assert.rejects(a.runStep('s', fail, { maxAttempts: 5 }), (e) => e instanceof PausedError && e.pause.reason === reason);
    assert.equal(calls, 1);

    // Still paused: no call is made, no retry loop.
    await assert.rejects(a.runStep('s', fail), PausedError);
    await assert.rejects(a.runStep('other', fail), PausedError);
    assert.equal(calls, 1);

    // Pause is durable across a browser restart and is scoped to its case.
    const store = make();
    const a2 = await store.openCase(CASE_A);
    assert.equal((await a2.pauseState()).reason, reason);
    const b = await store.openCase(CASE_B);
    assert.equal(await b.runStep('s', async () => 'b ok'), 'b ok');

    await a2.resume();
    assert.equal(await a2.runStep('s', async () => 'ok'), 'ok');
  });
}

test('PJe read without an open authenticated browser pauses; queue gives no background access', async () => {
  const { make, session } = env();
  session.open = false;
  let reads = 0;
  const a = await make().openCase(CASE_A);
  await assert.rejects(
    a.runStep('read-page-1', async () => ++reads, { needsBrowserSession: true }),
    (e) => e.pause?.reason === 'pje_session_unavailable',
  );
  assert.equal(reads, 0);
  session.open = true;
  await a.resume();
  assert.equal(await a.runStep('read-page-1', async () => ++reads, { needsBrowserSession: true }), 1);
});

// Gaps found in the #7 review of the first store (#18). Synthetic fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASE_A, CASE_B, env } from './fixtures.js';
import { CaseStore, MemoryBackend, redact } from '../src/index.js';

// A backend that delegates to `backend` and lets a test fail one operation.
const wrap = (backend, over) => ({
  get: (k) => backend.get(k),
  put: (k, v) => backend.put(k, v),
  delete: (k) => backend.delete(k),
  keys: (p) => backend.keys(p),
  ...over(backend),
});

test('a user edit racing a generated revision keeps both', async () => {
  const { make } = env();
  const a = await make().openCase(CASE_A);
  await a.addGeneratedRevision('d1', 'gen 1');
  await Promise.all([a.saveUserEdit('d1', 'manual'), a.addGeneratedRevision('d1', 'gen 2', { stepId: 's2' })]);
  const d = await a.getDraft('d1');
  assert.equal(d.current, 'manual');
  assert.equal(d.generated.length, 2);
  assert.ok(d.conflict);
});

test('concurrent messages and a second handle of the same case lose nothing', async () => {
  const { make } = env();
  const store = make();
  const a = await store.openCase(CASE_A);
  const a2 = await store.openCase(CASE_A);
  await Promise.all([1, 2, 3, 4].map((i) => (i % 2 ? a : a2).appendMessage('main', { role: 'user', text: `m${i}` })));
  assert.equal((await a.get('conversation', 'main')).messages.length, 4);
});

test('the same step called twice at once runs its side effect once', async () => {
  const { make } = env();
  const a = await make().openCase(CASE_A);
  let calls = 0;
  const fn = async () => (++calls, 'r');
  const out = await Promise.all([a.runStep('s', fn), a.runStep('s', fn)]);
  assert.deepEqual(out, ['r', 'r']);
  assert.equal(calls, 1);
});

test('a failed result write does not run the completed side effect again', async () => {
  const backend = new MemoryBackend();
  const c = { n: 0 };
  let failDone = true;
  const flaky = wrap(backend, (b) => ({
    put: async (k, v) => {
      if (failDone && k.endsWith('/call/s') && v.status === 'done') throw new Error('QuotaExceededError');
      return b.put(k, v);
    },
  }));
  const store = new CaseStore({ backend: flaky, now: () => ++c.n, sleep: async () => {} });
  const a = await store.openCase(CASE_A);
  let calls = 0;
  await assert.rejects(a.runStep('s', async () => (++calls, 'r')), (e) => e.name === 'StepResultNotStoredError' && e.result === 'r');
  assert.equal(calls, 1);
  failDone = false;
  // The record still shows the call as started, and the key lets the remote side deduplicate.
  assert.equal((await a.get('call', 's')).status, 'running');
});

test('a partly deleted case does not break expire() or diagnostics, and is finished off', async () => {
  const backend = new MemoryBackend();
  const c = { t: 1_000_000 };
  let fail = false;
  const crashing = wrap(backend, (b) => ({
    delete: async (k) => {
      if (fail && k.includes('/draft/')) throw new Error('crash');
      return b.delete(k);
    },
  }));
  const mk = (b) => new CaseStore({ backend: b, now: () => c.t, sleep: async () => {} });
  const store = mk(crashing);
  const a = await store.openCase(CASE_A);
  const b = await store.openCase(CASE_B);
  await a.saveUserEdit('d1', 'x');
  await b.saveUserEdit('d1', 'y');
  fail = true;
  await assert.rejects(store.deleteCase(CASE_A));
  fail = false;
  const after = mk(backend);
  assert.ok(!(await after.listCases()).includes(CASE_A));
  await after.diagnostics();
  await after.expire();
  assert.ok((await backend.keys('')).every((k) => !k.includes(CASE_A)));
  assert.equal((await (await after.openCase(CASE_B)).getDraft('d1')).current, 'y');
});

test('a stale handle that writes after deletion leaves nothing behind after expire()', async () => {
  const { make, backend } = env();
  const store = make();
  const a = await store.openCase(CASE_A);
  await store.deleteCase(CASE_A);
  await a.put('draft', 'late', { text: 'late write' });
  await store.expire();
  assert.deepEqual((await backend.keys('')).filter((k) => k.includes(CASE_A)), []);
});

test('opening an expired case that expire() has not yet removed starts it empty', async () => {
  const { make, clock } = env();
  const store = make();
  const a = await store.openCase(CASE_A);
  await a.saveUserEdit('d1', 'old');
  clock.advance(31 * 24 * 3600_000);
  const again = await store.openCase(CASE_A);
  assert.equal((await again.getDraft('d1')).current, null);
});

test('taking the generated text keeps the discarded user edit', async () => {
  const { make } = env();
  const a = await make().openCase(CASE_A);
  await a.addGeneratedRevision('d1', 'gen 1');
  await a.saveUserEdit('d1', 'manual');
  await a.addGeneratedRevision('d1', 'gen 2');
  await a.resolveConflict('d1', 'take-generated');
  const d = await a.getDraft('d1');
  assert.equal(d.current, 'gen 2');
  assert.deepEqual(d.discarded.map((x) => x.text), ['manual']);
});

test('pausing one case leaves another case runnable after switching back and forth', async () => {
  const { make } = env();
  const store = make();
  const a = await store.openCase(CASE_A);
  await assert.rejects(a.runStep('s', async () => { throw Object.assign(new Error('x'), { status: 429 }); }));
  const b = await store.openCase(CASE_B);
  assert.equal(await b.runStep('s', async () => 'b'), 'b');
  assert.equal((await (await store.openCase(CASE_A)).pauseState()).reason, 'quota_exhausted');
  assert.equal(await b.pauseState(), null);
});

test('redaction covers JSON bodies, header lists and the case number', () => {
  const samples = [
    '{"access_token":"abcDEF123456"}',
    '{"password": "hunter2hunter2"}',
    'Authorization: Basic dXNlcjpwYXNz',
    'Cookie: JSESSIONID=aaa111; other=bbb222',
    'Set-Cookie: sid=ccc333; Path=/',
    'failed at 0000001-02.2025.4.01.3400 for the case',
  ];
  const out = samples.map(redact).join('\n');
  for (const secret of ['abcDEF123456', 'hunter2hunter2', 'dXNlcjpwYXNz', 'aaa111', 'bbb222', 'ccc333', '0000001-02.2025.4.01.3400']) {
    assert.ok(!out.includes(secret), `${secret} leaked:\n${out}`);
  }
});

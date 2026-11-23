// Gaps found in the #7 review of the first store (#18). Synthetic fixtures only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASE_A, CASE_B, env } from './fixtures.js';
import { CaseStore, MemoryBackend, createAesGcmCodec, redact } from '../src/index.js';

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

// ---- review findings P1 and P2 at 41fcc2c ----

// An encrypted store on a backend whose reads and meta writes a test can disturb.
function disturbed() {
  const backend = new MemoryBackend();
  const hooks = { failMetaGet: 0, holdMetaPut: null };
  const flaky = wrap(backend, (b) => ({
    get: async (k) => {
      if (hooks.failMetaGet > 0 && k.endsWith('/meta')) {
        hooks.failMetaGet--;
        throw new Error('transient read error');
      }
      return b.get(k);
    },
    put: async (k, v) => {
      if (hooks.holdMetaPut && k.endsWith('/meta')) await hooks.holdMetaPut();
      return b.put(k, v);
    },
  }));
  const make = () => new CaseStore({ backend: flaky, codec: createAesGcmCodec({ backend: flaky }), sleep: async () => {} });
  return { backend, hooks, make };
}

test('P1: a transient meta read error in openCase never destroys the case or its key', async () => {
  const { backend, hooks, make } = disturbed();
  const a = await make().openCase(CASE_A);
  await a.saveUserEdit('d1', 'precious edit');
  hooks.failMetaGet = 1;
  await assert.rejects(make().openCase(CASE_A), /transient read error/);
  assert.ok(await backend.get(`case/${CASE_A}/meta`));
  assert.ok(await backend.get(`keys/${CASE_A}`));
  assert.equal((await (await make().openCase(CASE_A)).getDraft('d1')).current, 'precious edit');
});

test('P1: a transient meta read error in expire() deletes nothing', async () => {
  const { backend, hooks, make } = disturbed();
  const a = await make().openCase(CASE_A);
  await a.saveUserEdit('d1', 'precious edit');
  await a.putTemp('dl', 'bytes', 60_000);
  hooks.failMetaGet = 1;
  await assert.rejects(make().expire(), /transient read error/);
  assert.ok(await backend.get(`keys/${CASE_A}`));
  const again = await make().openCase(CASE_A);
  assert.equal((await again.getDraft('d1')).current, 'precious edit');
  assert.equal(await again.getTemp('dl'), 'bytes');
});

test('P2: expire() during the first meta write of openCase does not delete the new key', async () => {
  const { backend, hooks, make } = disturbed();
  let release;
  let writing;
  const started = new Promise((r) => (writing = r));
  hooks.holdMetaPut = () => (writing(), new Promise((r) => (release = r)));
  const store = make(); // the lock is per store instance (one JS context)
  const opening = store.openCase(CASE_A);
  await started; // the key exists, the meta record does not yet
  hooks.holdMetaPut = null;
  const expiring = store.expire();
  await new Promise((r) => setImmediate(r));
  release();
  await Promise.all([opening, expiring]);
  assert.ok(await backend.get(`keys/${CASE_A}`));
  // After a restart (new codec, no cached key) the case is still readable.
  const restarted = make();
  assert.deepEqual((await restarted.diagnostics()).cases.map((c) => [c.caseId, c.damaged ?? false]), [[CASE_A, false]]);
  const a = await restarted.openCase(CASE_A);
  await a.saveUserEdit('d1', 'after');
  assert.equal((await (await make().openCase(CASE_A)).getDraft('d1')).current, 'after');
});

// ---- review findings at 265c2d8 ----

test('R1: a step still running when its case is deleted and reopened does not leak into the new case', async () => {
  const { make } = env({ encrypted: false });
  const store = make();
  const a = await store.openCase(CASE_A);
  let releaseOld;
  const old = a.runStep('s', () => new Promise((r) => (releaseOld = r)));
  await new Promise((r) => setImmediate(r));
  await store.deleteCase(CASE_A);
  const a2 = await store.openCase(CASE_A);
  let fresh = 0;
  const blocked = Symbol('blocked');
  const got = await Promise.race([a2.runStep('s', async () => (++fresh, 'fresh')), new Promise((r) => setTimeout(() => r(blocked), 200))]);
  assert.equal(got, 'fresh');
  assert.equal(fresh, 1);
  releaseOld('old');
  assert.equal(await old, 'old'); // the old caller still gets its own result
  assert.equal((await a2.get('call', 's')).result, 'fresh'); // ...and it is not written into the new case
});

test('R2: deleteCase with an invalid id rejects instead of throwing synchronously', async () => {
  const { make } = env();
  let caught;
  await make().deleteCase('bad id!').catch((e) => (caught = e));
  assert.ok(caught instanceof TypeError);
});

test('R3: expire() finishes the sweep, then reports the failed case and what it removed', async () => {
  const { backend, hooks, make } = disturbed();
  const store = make();
  const a = await store.openCase(CASE_A);
  await a.saveUserEdit('d1', 'kept');
  await backend.put('case/orphan-z/draft/x', 1); // left-over of a stopped deletion
  hooks.failMetaGet = 1; // the first meta read (fixture-alpha) fails
  const err = await store.expire().catch((e) => e);
  assert.ok(err instanceof AggregateError, String(err));
  assert.match(err.message, /transient read error/);
  assert.deepEqual(err.removed.cases, ['orphan-z']);
  assert.equal((await (await make().openCase(CASE_A)).getDraft('d1')).current, 'kept');
});

// A store whose backoff sleeps wait until the test releases them.
function heldSleeps() {
  const backend = new MemoryBackend();
  const waiting = [];
  const store = new CaseStore({ backend, sleep: () => new Promise((r) => waiting.push(r)) });
  return { backend, store, waiting };
}
const tick = () => new Promise((r) => setImmediate(r));
const withTimeout = (p, ms = 200) => Promise.race([p, new Promise((r) => setTimeout(() => r('BLOCKED'), ms))]);

test('R1b: a late failure from a deleted lifetime writes no error marker into the replacement case', async () => {
  const { store } = heldSleeps();
  const a = await store.openCase(CASE_A);
  let failOld;
  const old = a.runStep('s', () => new Promise((_, rej) => (failOld = rej)), { maxAttempts: 1 });
  const oldOutcome = old.catch((e) => e);
  await tick();
  await store.deleteCase(CASE_A);
  const a2 = await store.openCase(CASE_A);
  let fresh = 0;
  assert.equal(await withTimeout(a2.runStep('s', async () => (++fresh, 'fresh'))), 'fresh');
  failOld(new Error('late network failure'));
  assert.match((await oldOutcome).message, /late network failure/); // the old caller sees its own error
  assert.equal(fresh, 1);
  assert.deepEqual(await a2.get('call', 's'), { ...(await a2.get('call', 's')), status: 'done', attempts: 1, result: 'fresh' });
  assert.equal((await a2.get('call', 's')).error, undefined);
});

test('R1b: a retry loop from a deleted lifetime stops after its backoff and writes nothing', async () => {
  const { store, waiting } = heldSleeps();
  const a = await store.openCase(CASE_A);
  let oldCalls = 0;
  const old = a.runStep('s', async () => (++oldCalls, Promise.reject(new Error('network reset'))), { maxAttempts: 3 });
  const oldOutcome = old.catch((e) => e);
  while (!waiting.length) await tick(); // the old step is sleeping before its second attempt
  await store.deleteCase(CASE_A);
  const a2 = await store.openCase(CASE_A);
  let fresh = 0;
  assert.equal(await withTimeout(a2.runStep('s', async () => (++fresh, 'fresh'))), 'fresh');
  waiting.shift()(); // the old backoff ends
  const outcome = await oldOutcome;
  assert.equal(outcome.name, 'CaseLifetimeEndedError');
  assert.equal(oldCalls, 1); // no second call for a case that is gone
  const rec = await a2.get('call', 's');
  assert.deepEqual([rec.status, rec.attempts, rec.result, rec.error], ['done', 1, 'fresh', undefined]);
});

// ---- review finding at cddf5a0: a failed deletion must not end the case lifetime ----

// A store on a backend and codec that can each throw once during deleteCase. Backoff sleeps
// wait in `waiting` until the test releases them.
function failingDelete({ deleteFails = () => false } = {}) {
  const backend = new MemoryBackend();
  const armed = { codec: false, backend: false };
  const waiting = [];
  const flaky = wrap(backend, (b) => ({
    delete: async (k) => {
      if (armed.backend && deleteFails(k)) {
        armed.backend = false;
        throw new Error('delete failed');
      }
      return b.delete(k);
    },
  }));
  const aes = createAesGcmCodec({ backend: flaky });
  const codec = {
    ...aes,
    forget: async (id) => {
      if (armed.codec) {
        armed.codec = false;
        throw new Error('forget failed');
      }
      return aes.forget(id);
    },
  };
  const store = new CaseStore({ backend: flaky, codec, sleep: () => new Promise((r) => waiting.push(r)) });
  return { backend, armed, store, waiting };
}

const leftOf = async (backend, id) => (await backend.keys('')).filter((k) => k.includes(id));

test('D(a): when the key removal fails the lifetime does not end and completed work is stored', async () => {
  const { backend, armed, store } = failingDelete();
  const a = await store.openCase(CASE_A);
  const b = await store.openCase(CASE_B);
  await a.saveUserEdit('d1', 'alpha edit');
  await b.saveUserEdit('d1', 'beta edit');
  let finish;
  const step = a.runStep('s', () => new Promise((r) => (finish = r)));
  while (!finish) await tick();
  const before = store.epochs.get(CASE_A) ?? 0;
  armed.codec = true;
  await assert.rejects(store.deleteCase(CASE_A), /forget failed/);
  assert.equal(store.epochs.get(CASE_A) ?? 0, before);
  assert.equal((await a.getDraft('d1')).current, 'alpha edit'); // still readable
  finish('done-result');
  assert.equal(await step, 'done-result');
  const rec = await a.get('call', 's');
  assert.deepEqual([rec.status, rec.result], ['done', 'done-result']); // stored, not dropped
  await store.deleteCase(CASE_A); // the retry succeeds and ends the lifetime
  assert.equal(store.epochs.get(CASE_A), before + 1);
  assert.deepEqual(await leftOf(backend, CASE_A), []);
  assert.equal((await (await store.openCase(CASE_B)).getDraft('d1')).current, 'beta edit');
});

for (const [label, deleteFails] of [
  ['the meta delete throws', (k) => k.endsWith('/meta')],
  ['a key-sweep delete throws', (k) => k.includes('/draft/')],
]) {
  test(`D(b): when ${label} after the key is gone the lifetime has ended and old writes are refused`, async () => {
    const { backend, armed, store, waiting } = failingDelete({ deleteFails });
    const a = await store.openCase(CASE_A);
    await a.saveUserEdit('d1', 'alpha edit');
    // One step is finishing, one is in a retry backoff; both started in the old lifetime.
    let finish;
    const finishing = a.runStep('s1', () => new Promise((r) => (finish = r)));
    let calls = 0;
    const retrying = a.runStep('s2', async () => (++calls, Promise.reject(new Error('network reset'))), { maxAttempts: 3 });
    const retryOutcome = retrying.catch((e) => e);
    while (!finish || !waiting.length) await tick();
    const before = store.epochs.get(CASE_A) ?? 0;
    armed.backend = true;
    await assert.rejects(store.deleteCase(CASE_A), /delete failed/);
    assert.equal(store.epochs.get(CASE_A), before + 1); // the key is gone: the lifetime ended
    assert.equal(await backend.get(`keys/${CASE_A}`), undefined);
    finish('late-result');
    waiting.shift()(); // the backoff of s2 ends
    assert.equal(await finishing, 'late-result'); // its own caller still gets it
    assert.equal((await retryOutcome).name, 'CaseLifetimeEndedError');
    assert.equal(calls, 1);
    assert.equal(await backend.get(`keys/${CASE_A}`), undefined); // nothing recreated the key
    await store.deleteCase(CASE_A); // the retry finishes the cleanup
    assert.deepEqual(await leftOf(backend, CASE_A), []);
  });
}

test('D: after a successful deletion the epoch is bumped and a late write is refused', async () => {
  const { store } = failingDelete();
  const a = await store.openCase(CASE_A);
  let finish;
  const step = a.runStep('s', () => new Promise((r) => (finish = r)));
  while (!finish) await tick();
  const before = store.epochs.get(CASE_A) ?? 0;
  await store.deleteCase(CASE_A);
  assert.equal(store.epochs.get(CASE_A), before + 1);
  const a2 = await store.openCase(CASE_A);
  finish('late');
  assert.equal(await step, 'late');
  assert.equal(await a2.get('call', 's'), undefined);
});

// ---- review finding at 2b55576: a handle belongs to the lifetime it was opened in ----

test('H(a): a handle opened before a deletion cannot run a step afterwards', async () => {
  const { backend, store } = failingDelete();
  const old = await store.openCase(CASE_A);
  await store.deleteCase(CASE_A);
  let ran = 0;
  await assert.rejects(old.runStep('s', async () => ++ran), (e) => e.name === 'CaseLifetimeEndedError');
  assert.equal(ran, 0);
  assert.deepEqual(await leftOf(backend, CASE_A), []); // no key and no record came back

  const fresh = await store.openCase(CASE_A);
  await assert.rejects(old.runStep('s', async () => ++ran), (e) => e.name === 'CaseLifetimeEndedError');
  assert.equal(ran, 0);
  assert.deepEqual(await fresh.list('call'), []); // nothing written into the new lifetime
});

test('H(b): a step queued on the old handle when the delete runs leaves the new lifetime clean', async () => {
  const { backend, store } = failingDelete();
  const old = await store.openCase(CASE_A);
  let finish;
  const queued = old.runStep('s', () => new Promise((r) => (finish = r)));
  while (!finish) await tick();
  await store.deleteCase(CASE_A);
  const fresh = await store.openCase(CASE_A);
  const keyBefore = await backend.get(`keys/${CASE_A}`);
  finish('late');
  assert.equal(await queued, 'late');
  assert.deepEqual(await fresh.list('call'), []);
  assert.equal(await fresh.pauseState(), null); // the new key still decrypts the new meta
  assert.deepEqual(await backend.get(`keys/${CASE_A}`), keyBefore);
});

test('H(c): a handle from the reopened case runs its own step once and stores it', async () => {
  const { store } = failingDelete();
  await store.openCase(CASE_A);
  await store.deleteCase(CASE_A);
  // Opened while another delete is queued: still bound to the lifetime that exists after it.
  const [, fresh] = await Promise.all([store.deleteCase(CASE_A), store.openCase(CASE_A)]);
  let calls = 0;
  assert.equal(await fresh.runStep('s', async () => (++calls, 'mine')), 'mine');
  assert.equal(await fresh.runStep('s', async () => (++calls, 'again')), 'mine');
  assert.equal(calls, 1);
  assert.equal((await fresh.get('call', 's')).result, 'mine');
});

// Storage, deletion, expiration, and case-isolation checks on the mocked build.
import assert from 'node:assert/strict';
import { CaseStore, MemoryBackend, createAesGcmCodec } from '../../case-store/src/index.js';

const CASE_A = 'fixture-alpha';
const CASE_B = 'fixture-beta';
const BEARER = 'Bearer synthetic.FAKE.bearer-0123456789abcdef';

function clock(start = 1_000_000) {
  const c = { t: start, now: () => c.t, advance: (ms) => { c.t += ms; } };
  return c;
}

function encrypted() {
  const backend = new MemoryBackend();
  const c = clock();
  const store = new CaseStore({
    backend,
    codec: createAesGcmCodec({ backend }),
    now: c.now,
    sleep: async () => {},
    browserSession: () => false,
  });
  return { backend, clock: c, store };
}

export async function runStorageChecks() {
  const checks = [];
  const pass = (id) => checks.push({ id, pass: true });

  {
    const { backend, store } = encrypted();
    const a = await store.openCase(CASE_A);
    const b = await store.openCase(CASE_B);
    await a.saveUserEdit('d1', 'alpha-edit');
    await b.saveUserEdit('d1', 'beta-edit');
    await a.put('checkpoint', 'reader', { page: 1 });
    await store.deleteCase(CASE_A);
    const keys = await backend.keys('');
    assert.ok(keys.every((k) => !k.includes(CASE_A)));
    assert.deepEqual(await store.listCases(), [CASE_B]);
    assert.equal((await b.getDraft('d1')).current, 'beta-edit');
    pass('delete-one-case');
  }

  {
    const { store, clock: c } = encrypted();
    const a = await store.openCase(CASE_A);
    await a.saveUserEdit('d1', 'alpha-edit');
    await a.putTemp('blob', 'bytes', 60_000);
    await a.putTemp('kept', 'stay', 10 * 60_000);
    c.advance(120_000);
    assert.equal(await a.getTemp('blob'), undefined);
    assert.deepEqual(await store.expire(), { cases: [], temp: 1 });
    assert.deepEqual(await a.list('temp'), ['kept']);
    c.advance(29 * 24 * 3600_000);
    const b = await store.openCase(CASE_B);
    await b.saveUserEdit('d1', 'beta-edit');
    c.advance(2 * 24 * 3600_000);
    assert.deepEqual((await store.expire()).cases, [CASE_A]);
    assert.equal((await b.getDraft('d1')).current, 'beta-edit');
    pass('expire-temp-and-case');
  }

  {
    const { backend, store } = encrypted();
    const a = await store.openCase(CASE_A);
    await a.saveUserEdit('d1', 'PLAINTEXT-MARKER');
    const raw = JSON.stringify(backend.dump(), (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v));
    assert.equal(raw.includes('PLAINTEXT-MARKER'), false);
    pass('ciphertext-hides-plaintext');
  }

  {
    const { backend, store } = encrypted();
    const a = await store.openCase(CASE_A);
    await store.openCase(CASE_B);
    await a.put('draft', 'd1', { text: 'alpha only' });
    await backend.put(`case/${CASE_B}/draft/d1`, await backend.get(`case/${CASE_A}/draft/d1`));
    const b = await store.openCase(CASE_B);
    await assert.rejects(b.get('draft', 'd1'));
    pass('copied-record-does-not-decrypt');
  }

  {
    const { backend, store } = encrypted();
    const a = await store.openCase(CASE_A);
    await a.put('draft', 'd1', { text: 'alpha only' });
    const leftover = await backend.get(`case/${CASE_A}/draft/d1`);
    await store.deleteCase(CASE_A);
    await backend.put(`case/${CASE_A}/draft/d1`, leftover);
    const again = await store.openCase(CASE_A);
    await assert.rejects(again.get('draft', 'd1'));
    pass('deleted-key-leaves-ciphertext-unreadable');
  }

  {
    const { store } = encrypted();
    const a = await store.openCase(CASE_A);
    for (const bad of ['../fixture-beta/draft/d1', 'x/y', '', 'a'.repeat(200)]) {
      await assert.rejects(a.put('draft', bad, { text: 'x' }), TypeError);
    }
    await assert.rejects(store.openCase('fixture-alpha/draft'), TypeError);
    pass('namespace-escape');
  }

  {
    const { store } = encrypted();
    const a = await store.openCase(CASE_A);
    const b = await store.openCase(CASE_B);
    await a.saveUserEdit('d1', 'alpha-edit');
    await b.put('checkpoint', 'reader', { page: 2 });
    assert.equal((await b.getDraft('d1')).current, null);
    assert.equal(await a.get('checkpoint', 'reader'), undefined);
    assert.equal((await a.getDraft('d1')).current, 'alpha-edit');
    pass('case-isolation');
  }

  {
    const backend = new MemoryBackend();
    const store = new CaseStore({ backend, now: () => 1_000, sleep: async () => {}, browserSession: () => false });
    const c = await store.openCase(CASE_A);
    await assert.rejects(c.runStep('diag', async () => { throw new Error(BEARER); }, { maxAttempts: 1, backoffMs: 0 }));
    const diag = JSON.stringify(await store.diagnostics());
    assert.equal(diag.includes('synthetic.FAKE'), false);
    assert.equal(diag.includes(CASE_B), false);
    pass('diagnostics-redact-token');
  }

  return { checks, failed: checks.filter((c) => c.pass !== true).length };
}

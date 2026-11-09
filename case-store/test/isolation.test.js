import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASE_A, CASE_B, env } from './fixtures.js';

test('two cases never mix sources, conversation, drafts or checkpoints', async () => {
  const { make } = env();
  const store = make();
  const a = await store.openCase(CASE_A);
  const b = await store.openCase(CASE_B);

  await a.put('inventory', 'index', { docs: ['doc-1', 'doc-2'] });
  await b.put('inventory', 'index', { docs: ['doc-9'] });
  await a.putExtraction('doc-1', 1, { text: 'alpha text v1' });
  await a.putExtraction('doc-1', 2, { text: 'alpha text v2' });
  await a.appendMessage('main', { role: 'user', text: 'alpha question' });
  await b.appendMessage('main', { role: 'user', text: 'beta question' });
  await a.saveUserEdit('d1', 'alpha draft');
  await b.put('checkpoint', 'reader', { page: 3 });

  assert.deepEqual(await a.get('inventory', 'index'), { docs: ['doc-1', 'doc-2'] });
  assert.deepEqual(await b.get('inventory', 'index'), { docs: ['doc-9'] });
  assert.deepEqual(await a.list('extraction'), ['doc-1@1', 'doc-1@2']);
  assert.deepEqual(await b.list('extraction'), []);
  assert.equal((await b.get('conversation', 'main')).messages[0].text, 'beta question');
  assert.equal((await a.get('conversation', 'main')).messages.length, 1);
  assert.equal((await b.getDraft('d1')).current, null);
  assert.equal(await a.get('checkpoint', 'reader'), undefined);
});

test('names cannot escape the case namespace', async () => {
  const { make } = env();
  const a = await make().openCase(CASE_A);
  for (const bad of ['../fixture-beta/draft/d1', 'x/y', '', 'a'.repeat(200)]) {
    await assert.rejects(a.put('draft', bad, 1), TypeError);
  }
  await assert.rejects(a.put('secrets', 'x', 1), TypeError);
  await assert.rejects(make().openCase('fixture-alpha/draft'), TypeError);
});

test('a record copied into another case does not decrypt there', async () => {
  const { make, backend } = env();
  const store = make();
  const a = await store.openCase(CASE_A);
  await store.openCase(CASE_B);
  await a.put('draft', 'd1', { text: 'alpha only' });
  await backend.put(`case/${CASE_B}/draft/d1`, await backend.get(`case/${CASE_A}/draft/d1`));
  const b = await store.openCase(CASE_B);
  await assert.rejects(b.get('draft', 'd1'));
});

test('stored records are ciphertext with the AES-GCM codec', async () => {
  const { make, backend } = env();
  const a = await make().openCase(CASE_A);
  await a.saveUserEdit('d1', 'PLAINTEXT-MARKER');
  const raw = JSON.stringify(backend.dump(), (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v));
  assert.ok(!raw.includes('PLAINTEXT-MARKER'));
});

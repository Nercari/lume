import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASE_A, CASE_B, env } from './fixtures.js';

async function seed(c) {
  await c.put('inventory', 'index', { docs: ['doc-1'] });
  await c.saveUserEdit('d1', 'text');
  await c.putTemp('download-1', 'bytes', 60_000);
}

test('deleting one case removes its records, temp entries and key; the other stays', async () => {
  const { make, backend } = env();
  const store = make();
  const a = await store.openCase(CASE_A);
  const b = await store.openCase(CASE_B);
  await seed(a);
  await seed(b);

  await store.deleteCase(CASE_A);
  const keys = await backend.keys('');
  assert.ok(keys.every((k) => !k.includes(CASE_A)), keys.join('\n'));
  assert.deepEqual(await store.listCases(), [CASE_B]);
  assert.equal((await b.getDraft('d1')).current, 'text');
  assert.equal(await b.getTemp('download-1'), 'bytes');
});

test('expiration removes expired temp entries and expired cases only', async () => {
  const { make, clock } = env();
  const store = make();
  const a = await store.openCase(CASE_A);
  await seed(a);
  await a.putTemp('long', 'keep', 10 * 60_000);
  clock.advance(120_000);
  assert.equal(await a.getTemp('download-1'), undefined);
  assert.deepEqual(await store.expire(), { cases: [], temp: 1 });
  assert.deepEqual(await a.list('temp'), ['long']);

  clock.advance(29 * 24 * 3600_000);
  const b = await store.openCase(CASE_B); // opened later, so it expires later
  await seed(b);
  clock.advance(2 * 24 * 3600_000);
  assert.deepEqual(await store.expire(), { cases: [CASE_A], temp: 1 });
  assert.deepEqual(await store.listCases(), [CASE_B]);
  assert.equal((await b.getDraft('d1')).current, 'text');
});

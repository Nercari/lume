// Packaging acceptance: teardown behavior from #7 APIs (mocks only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASE_A, CASE_B, env } from '../../case-store/test/fixtures.js';

test('D1/D2: deleteCase removes one case and leaves the other intact', async () => {
  const { make, backend } = env();
  const store = make();
  const a = await store.openCase(CASE_A);
  const b = await store.openCase(CASE_B);
  await a.put('inventory', 'index', { docs: ['d1'] });
  await b.put('inventory', 'index', { docs: ['d2'] });

  await store.deleteCase(CASE_A);
  const keys = await backend.keys('');
  assert.ok(keys.every((k) => !k.includes(CASE_A)), keys.join('\n'));
  assert.deepEqual(await store.listCases(), [CASE_B]);
  assert.deepEqual((await b.get('inventory', 'index')).docs, ['d2']);
});

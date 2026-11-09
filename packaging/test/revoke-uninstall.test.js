// Packaging acceptance: teardown behavior from #5 and #7 APIs (mocks only).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenCustody } from '../../companion/src/custody.js';
import { MemoryVault, fakeTokens, codeError } from '../../companion/test/fakes.js';
import { CASE_A, CASE_B, env } from '../../case-store/test/fixtures.js';

test('R2/R3: logout revokes when possible and always clears vault', async () => {
  const vault = new MemoryVault();
  const c = new TokenCustody({ vault, accountKey: 'packaging-acct', clientId: 'synthetic-client' });
  const tok = fakeTokens();
  await c.store(tok);
  let seen;
  assert.deepEqual(await c.logout(async ({ refreshToken }) => (seen = refreshToken.reveal())), { revoked: true });
  assert.equal(seen, tok.refresh_token);
  assert.equal(vault.map.size, 0);

  await c.store(fakeTokens());
  assert.deepEqual(await c.logout(async () => { throw codeError('ETIMEDOUT'); }), { revoked: false });
  assert.equal(vault.map.size, 0);
});

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

test('companion command surface stays fixed (packaging assumes no extra teardown cmds)', () => {
  // Import without executing host
  return import('../../companion/src/commands.js').then(({ COMMANDS }) => {
    assert.deepEqual(Object.keys(COMMANDS).sort(), ['login.start', 'logout', 'status']);
  });
});

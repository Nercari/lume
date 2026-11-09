import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TokenCustody } from '../src/custody.js';
import { MemoryVault, fakeTokens, codeError } from './fakes.js';

const make = (opts = {}) => {
  const vault = new MemoryVault();
  let t = 1_000_000;
  const clock = { now: () => t, advance: (ms) => (t += ms) };
  const c = new TokenCustody({ vault, accountKey: 'acct-test', clientId: 'synthetic-client', now: clock.now, ...opts });
  return { c, vault, clock };
};

test('refresh token lives only in the vault; access token only in memory', async () => {
  const { c, vault } = make();
  const tok = fakeTokens();
  await c.store(tok);
  const stored = [...vault.map.values()].join();
  assert.ok(stored.includes(tok.refresh_token));
  assert.ok(!stored.includes(tok.access_token), 'access token must not be persisted');
  assert.equal((await c.accessToken()).reveal(), tok.access_token);
});

test('refresh is serialized and rotates the refresh token', async () => {
  const { c, vault, clock } = make();
  await c.store(fakeTokens());
  clock.advance(3600 * 1000);
  const seen = [];
  const next = fakeTokens();
  const refreshFn = async ({ refreshToken, clientId }) => {
    seen.push(refreshToken.reveal());
    assert.equal(clientId, 'synthetic-client');
    await new Promise((r) => setTimeout(r, 5));
    return next;
  };
  const [a, b] = await Promise.all([c.accessToken(refreshFn), c.accessToken(refreshFn)]);
  assert.equal(seen.length, 1, 'only one refresh in flight');
  assert.equal(a.reveal(), next.access_token);
  assert.equal(a, b);
  assert.ok([...vault.map.values()].join().includes(next.refresh_token));
});

test('terminal refresh error clears tokens and reports auth_expired; transient error keeps them', async () => {
  const { c, vault, clock } = make();
  await c.store(fakeTokens());
  clock.advance(3600 * 1000);
  await assert.rejects(c.accessToken(async () => { throw codeError('ECONNRESET'); }), { code: 'ECONNRESET' });
  assert.equal(vault.map.size, 1, 'network failure must not erase credentials');
  await assert.rejects(c.accessToken(async () => { throw codeError('refresh_token_reused'); }), { code: 'auth_expired' });
  assert.equal(vault.map.size, 0);
  assert.deepEqual(await c.describe(), { signedIn: false, accessValid: false });
});

test('rejects a token response without ChatGPT plan scope', async () => {
  const { c, vault } = make();
  await assert.rejects(c.store({ ...fakeTokens(), scope: 'openid profile email offline_access' }), { code: 'plan_disabled' });
  assert.equal(vault.map.size, 0);
});

test('logout revokes then clears, and reports unconfirmed revocation', async () => {
  const { c, vault } = make();
  const tok = fakeTokens();
  await c.store(tok);
  let revoked;
  assert.deepEqual(await c.logout(async ({ refreshToken }) => (revoked = refreshToken.reveal())), { revoked: true });
  assert.equal(revoked, tok.refresh_token);
  assert.equal(vault.map.size, 0);
  await c.store(fakeTokens());
  assert.deepEqual(await c.logout(async () => { throw codeError('ETIMEDOUT'); }), { revoked: false });
  assert.equal(vault.map.size, 0);
});

test('requires an injected vault adapter and a per-user client ID', () => {
  assert.throws(() => new TokenCustody({ vault: {}, accountKey: 'a', clientId: 'c' }), TypeError);
  assert.throws(() => new TokenCustody({ vault: new MemoryVault(), accountKey: 'a' }), TypeError);
});

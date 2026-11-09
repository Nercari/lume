import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createHandlers } from '../src/handlers.js';
import { createRegistration } from '../src/auth.js';
import { TokenCustody } from '../src/custody.js';
import { MemoryVault, fakeTokens, codeError } from './fakes.js';

const hit = (url) =>
  new Promise((resolve, reject) => {
    request(url, { agent: false }, (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); }).on('error', reject).end();
  });

const setup = (exchange) => {
  const custody = new TokenCustody({ vault: new MemoryVault(), accountKey: 'acct-test', clientId: 'synthetic-client' });
  const registration = createRegistration({ hostId: 'urn:uuid:00000000-0000-4000-8000-000000000000' });
  return { custody, ...createHandlers({ registration, custody, exchange, timeoutMs: 2000 }) };
};

// Simulates the browser redirect locally; no real authorization URL is opened.
const completeLogin = async (handlers) => {
  const { authorizeUrl } = await handlers['login.start']();
  const p = new URL(authorizeUrl).searchParams;
  const cb = new URL(p.get('redirect_uri'));
  cb.searchParams.set('code', 'synthetic-code');
  cb.searchParams.set('state', p.get('state'));
  assert.equal(await hit(cb), 200);
  await new Promise((r) => setTimeout(r, 20));
};

test('login.start -> callback -> injected exchange -> custody; status shows signed in, no tokens', async () => {
  const tok = fakeTokens();
  const { handlers } = setup(async ({ code, attempt }) => {
    assert.equal(code.reveal(), 'synthetic-code');
    assert.ok(attempt.verifier.reveal());
    return tok;
  });
  await completeLogin(handlers);
  const s = await handlers.status();
  assert.deepEqual(s, { signedIn: true, accessValid: true, pause: null });
  assert.ok(!JSON.stringify(s).includes(tok.access_token));
  assert.deepEqual(await handlers.logout(), { revoked: false });
  assert.equal((await handlers.status()).signedIn, false);
});

test('a plan-disabled exchange result becomes a pause', async () => {
  const { handlers } = setup(async () => { throw codeError('plan_disabled'); });
  await completeLogin(handlers);
  assert.equal((await handlers.status()).pause.reason, 'plan_disabled');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { createAttempt, startCallbackListener, buildAuthorizeUrl, createRegistration, s256, checkNonce, checkPlanScope, CALLBACK_PATH } from '../src/auth.js';

// Loopback-only HTTP client; never contacts a real auth server.
const get = (port, path) =>
  new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, agent: false }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.end();
  });

const HOST_ID = 'urn:uuid:00000000-0000-4000-8000-000000000000';

test('valid callback resolves once, then the listener is closed (replay refused)', async () => {
  const attempt = createAttempt();
  const l = await startCallbackListener({ attempt, timeoutMs: 5000 });
  assert.match(l.redirectUri, /^http:\/\/127\.0\.0\.1:\d+\/auth\/callback$/);
  const path = `${CALLBACK_PATH}?code=synthetic-code-123&state=${attempt.state}`;
  assert.equal(await get(l.port, path), 200);
  assert.equal((await l.result).reveal(), 'synthetic-code-123');
  await assert.rejects(get(l.port, path), { code: 'ECONNREFUSED' });
});

test('state mismatch and wrong path are refused and do not consume the listener', async () => {
  const attempt = createAttempt();
  const l = await startCallbackListener({ attempt, timeoutMs: 5000 });
  assert.equal(await get(l.port, `${CALLBACK_PATH}?code=c&state=forged`), 400);
  assert.equal(await get(l.port, `${CALLBACK_PATH}?code=c`), 400);
  assert.equal(await get(l.port, `/callback?code=c&state=${attempt.state}`), 404);
  assert.equal(await get(l.port, `${CALLBACK_PATH}?code=good-code&state=${attempt.state}`), 200);
  assert.equal((await l.result).reveal(), 'good-code');
});

test('access_denied ends the attempt as plan_disabled without a code', async () => {
  const attempt = createAttempt();
  const l = await startCallbackListener({ attempt, timeoutMs: 5000 });
  assert.equal(await get(l.port, `${CALLBACK_PATH}?error=access_denied&state=${attempt.state}`), 400);
  await assert.rejects(l.result, { code: 'plan_disabled' });
});

test('times out and closes', async () => {
  const l = await startCallbackListener({ attempt: createAttempt(), timeoutMs: 30 });
  await assert.rejects(l.result, { code: 'timeout' });
  await assert.rejects(get(l.port, CALLBACK_PATH), { code: 'ECONNREFUSED' });
});

test('close() cancels and frees the port', async () => {
  const l = await startCallbackListener({ attempt: createAttempt(), timeoutMs: 5000 });
  l.close();
  await assert.rejects(l.result, { code: 'cancelled' });
  await assert.rejects(get(l.port, CALLBACK_PATH), { code: 'ECONNREFUSED' });
});

test('refuses to bind to anything but 127.0.0.1', async () => {
  for (const host of ['0.0.0.0', '::', 'localhost', '::1', '192.168.0.10']) {
    await assert.rejects(startCallbackListener({ attempt: createAttempt(), host }), { code: 'non_loopback' }, host);
  }
});

test('PKCE is S256 of the verifier, fresh per attempt; a mismatched verifier does not verify', () => {
  const a = createAttempt();
  const b = createAttempt();
  assert.equal(s256(a.verifier.reveal()), a.challenge);
  assert.notEqual(s256(b.verifier.reveal()), a.challenge);
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.nonce, b.nonce);
  assert.match(a.verifier.reveal(), /^[A-Za-z0-9_-]{43,128}$/);
  // RFC 7636 Appendix B test vector.
  assert.equal(s256('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'), 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('nonce and plan-scope checks', () => {
  const a = createAttempt();
  checkNonce({ nonce: a.nonce }, a);
  assert.throws(() => checkNonce({ nonce: 'other' }, a), { code: 'nonce_mismatch' });
  assert.throws(() => checkNonce({}, a), { code: 'nonce_mismatch' });
  checkPlanScope('openid offline_access chatgpt.tokens.use.direct');
  assert.throws(() => checkPlanScope('openid profile email'), { code: 'plan_disabled' });
});

test('authorize URL carries per-user registration, S256, state, nonce; no shared client ID', () => {
  const a = createAttempt();
  const first = new URL(buildAuthorizeUrl(createRegistration({ hostId: HOST_ID }), a, 'http://127.0.0.1:1455/auth/callback'));
  assert.equal(first.origin + first.pathname, 'https://auth.openai.com/api/accounts/authorize');
  const p = first.searchParams;
  assert.equal(p.get('client_id'), 'dynamic_agent_client');
  assert.equal(p.get('ext_agent_host_id'), HOST_ID);
  assert.equal(p.get('code_challenge_method'), 'S256');
  assert.equal(p.get('code_challenge'), a.challenge);
  assert.equal(p.get('state'), a.state);
  assert.equal(p.get('nonce'), a.nonce);
  assert.equal(p.get('code_verifier'), null);
  const again = new URL(buildAuthorizeUrl(createRegistration({ hostId: HOST_ID, clientId: 'issued-to-this-user' }), a, 'http://127.0.0.1:1455/auth/callback'));
  assert.equal(again.searchParams.get('client_id'), 'issued-to-this-user');
  assert.equal(again.searchParams.get('ext_agent_host_id'), null);
  assert.throws(() => createRegistration({}), { code: 'bad_config' });
  assert.throws(() => createRegistration({ hostId: 'my-laptop' }), { code: 'bad_config' });
  assert.throws(() => createRegistration({ hostId: HOST_ID, clientId: 'dynamic_agent_client' }), { code: 'bad_config' });
});

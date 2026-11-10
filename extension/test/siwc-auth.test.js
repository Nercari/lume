import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import {
  AGENT_NAME,
  AUTHORIZE_URL,
  CALLBACK_PATH,
  ISSUER,
  PLAN_SCOPE,
  REGISTRATION_ENTRYPOINT,
  RESOURCE,
  SCOPES,
  TOKEN_URL,
  acceptCallback,
  b64urlDecode,
  b64urlEncode,
  buildAuthorizeUrl,
  createAttempt,
  discoverOpenId,
  exchangeAuthorizationCode,
  pauseFor,
  randomCallbackPort,
  redirectUri,
  scopeHasPlan,
  verifyIdToken,
} from '../src/siwc-auth.js';
import { createSiwcFixture } from './fixtures/siwc-auth-server.mjs';

const HOST = 'urn:uuid:123e4567-e89b-42d3-a456-426614174000';

function registration(extra = {}) {
  return { hostId: HOST, clientId: null, agentName: AGENT_NAME, ...extra };
}

test('PKCE S256, state and nonce are fresh and unpadded', async () => {
  const one = await createAttempt();
  const two = await createAttempt();
  assert.equal(one.verifier.length >= 43 && one.verifier.length <= 128, true);
  assert.equal(one.challenge, createHash('sha256').update(one.verifier).digest('base64url'));
  assert.equal(one.challenge.includes('='), false);
  assert.notEqual(one.state, two.state);
  assert.notEqual(one.nonce, two.nonce);
  assert.notEqual(one.verifier, one.state);
  assert.equal(one.state, b64urlEncode(b64urlDecode(one.state)));
});

test('authorize URL uses 127.0.0.1, the registration entrypoint, and no client secret', async () => {
  const attempt = await createAttempt();
  const port = randomCallbackPort();
  assert.equal(port >= 49152 && port <= 65535, true);
  const redirect = redirectUri(port);
  const url = new URL(buildAuthorizeUrl(registration(), attempt, redirect));
  assert.equal(url.origin + url.pathname, AUTHORIZE_URL);
  assert.equal(url.searchParams.get('client_id'), REGISTRATION_ENTRYPOINT);
  assert.equal(url.searchParams.get('redirect_uri'), `http://127.0.0.1:${port}${CALLBACK_PATH}`);
  assert.equal(url.searchParams.get('redirect_uri').includes('localhost'), false);
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), attempt.challenge);
  assert.equal(url.searchParams.get('state'), attempt.state);
  assert.equal(url.searchParams.get('nonce'), attempt.nonce);
  assert.equal(url.searchParams.get('resource'), RESOURCE);
  assert.equal(url.searchParams.get('scope'), SCOPES);
  assert.equal(url.searchParams.get('agent_name_hint'), 'Lume');
  assert.equal(url.searchParams.get('ext_agent_host_id'), HOST);
  assert.equal(url.searchParams.has('client_secret'), false);
  assert.equal(url.searchParams.has('prompt'), false);
});

test('a saved client id is reused and the agent name is omitted', async () => {
  const attempt = await createAttempt();
  const redirect = redirectUri(45000);
  const url = new URL(buildAuthorizeUrl(registration({
    clientId: 'oaiapp_synthetic',
    idTokenHint: 'hint.jwt.value',
    loginHint: 'synthetic@example.com',
    planDisabled: true,
  }), attempt, redirect));
  assert.equal(url.searchParams.get('client_id'), 'oaiapp_synthetic');
  assert.equal(url.searchParams.has('agent_name_hint'), false);
  assert.equal(url.searchParams.get('ext_agent_host_id'), HOST);
  assert.equal(url.searchParams.get('login_hint'), 'synthetic@example.com');
  assert.equal(url.searchParams.get('id_token_hint'), 'hint.jwt.value');
  assert.equal(url.searchParams.get('prompt'), 'consent');
  assert.throws(() => buildAuthorizeUrl(registration({ clientId: REGISTRATION_ENTRYPOINT }), attempt, redirect));
  assert.throws(() => buildAuthorizeUrl(registration(), attempt, 'http://localhost:1455/auth/callback'));
});

test('callback validates state, rejects localhost, and keeps a mismatched state unused', async () => {
  const attempt = await createAttempt();
  const good = acceptCallback(`http://127.0.0.1:1455/auth/callback?code=synthetic-code&state=${attempt.state}&client_id=oaiapp_synthetic`, attempt, {});
  assert.equal(good.code, 'synthetic-code');
  assert.equal(good.clientId, 'oaiapp_synthetic');
  assert.throws(() => acceptCallback(`http://127.0.0.1:1455/auth/callback?code=x&state=other&client_id=oaiapp_synthetic`, attempt, {}), (error) => error.code === 'state_mismatch');
  assert.throws(() => acceptCallback(`http://localhost:1455/auth/callback?code=x&state=${attempt.state}`, attempt, {}), (error) => error.code === 'bad_redirect');
  assert.throws(() => acceptCallback(`http://127.0.0.1:1455/auth/callback?error=access_denied&state=${attempt.state}`, attempt, {}), (error) => error.code === 'access_denied');
  assert.throws(() => acceptCallback(`http://127.0.0.1:1455/auth/callback?code=x&state=${attempt.state}`, attempt, {}), (error) => error.code === 'registration_incomplete');
  assert.throws(() => acceptCallback(`http://127.0.0.1:1455/auth/callback?code=x&state=${attempt.state}&client_id=oaiapp_other`, attempt, { pendingClientId: 'oaiapp_synthetic' }), (error) => error.code === 'client_mismatch');
});

test('ID token checks reject a bad signature, issuer, audience, nonce and expiry', async () => {
  const fixture = await createSiwcFixture();
  const nonce = 'nonce-synthetic';
  const now = 1_700_000_000_000;
  const claims = {
    iss: ISSUER,
    aud: fixture.issuedClientId,
    sub: fixture.subject,
    email: fixture.email,
    nonce,
    exp: Math.floor(now / 1000) + 600,
  };
  const token = await fixture.sign(claims);
  const ok = await verifyIdToken(token, { jwks: fixture.jwks(), audience: fixture.issuedClientId, nonce, now });
  assert.equal(ok.sub, fixture.subject);
  const parts = token.split('.');
  const sig = b64urlDecode(parts[2]);
  sig[0] ^= 0xff;
  const flipped = `${parts[0]}.${parts[1]}.${b64urlEncode(sig)}`;
  await assert.rejects(() => verifyIdToken(flipped, { jwks: fixture.jwks(), audience: fixture.issuedClientId, nonce, now }), (error) => error.code === 'bad_signature');
  await assert.rejects(async () => verifyIdToken(await fixture.sign({ ...claims, iss: 'https://evil.example' }), { jwks: fixture.jwks(), audience: fixture.issuedClientId, nonce, now }), (error) => error.code === 'bad_issuer');
  await assert.rejects(() => verifyIdToken(token, { jwks: fixture.jwks(), audience: 'oaiapp_other', nonce, now }), (error) => error.code === 'bad_audience');
  await assert.rejects(() => verifyIdToken(token, { jwks: fixture.jwks(), audience: fixture.issuedClientId, nonce: 'other-nonce', now }), (error) => error.code === 'nonce_mismatch');
  await assert.rejects(async () => verifyIdToken(await fixture.sign({ ...claims, exp: Math.floor(now / 1000) - 10 }), { jwks: fixture.jwks(), audience: fixture.issuedClientId, nonce, now }), (error) => error.code === 'expired');
  const noneHeader = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'none', kid: 'siwc-fixture' })));
  const nonePayload = token.split('.')[1];
  await assert.rejects(() => verifyIdToken(`${noneHeader}.${nonePayload}.x`, { jwks: fixture.jwks(), audience: fixture.issuedClientId, nonce, now }), (error) => error.code === 'bad_signature');
});

test('identity scopes do not enable the plan, and discovery stays on auth.openai.com', async () => {
  assert.equal(scopeHasPlan(SCOPES), true);
  assert.equal(scopeHasPlan('openid profile email'), false);
  assert.equal(scopeHasPlan(`openid+${PLAN_SCOPE}`), true);
  const fixture = await createSiwcFixture();
  const discovery = await discoverOpenId((url) => fixture.handle({ url: String(url) }));
  assert.equal(discovery.issuer, ISSUER);
  assert.equal(new URL(discovery.jwksUri).hostname, 'auth.openai.com');
  await assert.rejects(() => discoverOpenId(async () => new Response(JSON.stringify({
    issuer: ISSUER,
    jwks_uri: 'https://evil.example/jwks',
    revocation_endpoint: 'https://auth.openai.com/oauth/revoke',
  }), { status: 200 })), (error) => error.code === 'bad_discovery');
});

test('code exchange posts PKCE to the documented token endpoint and keeps the plan scope', async () => {
  let seen = null;
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: 'oaiapp_synthetic',
    code: 'synthetic-code',
    code_verifier: 'verifier-synthetic',
    redirect_uri: 'http://127.0.0.1:1455/auth/callback',
    resource: RESOURCE,
  });
  const json = await exchangeAuthorizationCode({
    clientId: 'oaiapp_synthetic',
    code: 'synthetic-code',
    verifier: 'verifier-synthetic',
    redirectUri: 'http://127.0.0.1:1455/auth/callback',
    fetch: async (url, opts) => {
      seen = { url: String(url), body: opts.body.toString() };
      return new Response(JSON.stringify({
        access_token: 'synthetic-access-token',
        refresh_token: 'synthetic-refresh-token',
        id_token: 'a.b.c',
        expires_in: 3600,
        scope: 'openid profile email',
      }), { status: 200 });
    },
  });
  assert.equal(seen.url, TOKEN_URL);
  assert.equal(seen.body, body.toString());
  assert.equal(scopeHasPlan(json.scope), false);
  await assert.rejects(() => exchangeAuthorizationCode({
    clientId: REGISTRATION_ENTRYPOINT,
    code: 'x',
    verifier: 'y',
    redirectUri: 'http://127.0.0.1:1/auth/callback',
    fetch: async () => new Response('{}', { status: 200 }),
  }), (error) => error.code === 'bad_config');
});

test('an ineligible account pauses with no code fix', () => {
  const pause = pauseFor({ code: 'subscription_sharing_user_not_eligible' });
  assert.equal(pause.resumable, false);
  assert.match(pause.message, /Não há correção no código do Lume/);
  assert.equal(pauseFor({ code: 'subscription_sharing_usage_limit_exceeded' }).resumable, true);
});

test('the auth modules do not open a port', () => {
  const dir = new URL('../src/', import.meta.url);
  for (const name of readdirSync(dir)) {
    if (!/^siwc-.*\.js$/u.test(name)) continue;
    const text = readFileSync(new URL(name, dir), 'utf8');
    assert.equal(/\bcreateServer\b|\.listen\(/.test(text), false, name);
  }
});

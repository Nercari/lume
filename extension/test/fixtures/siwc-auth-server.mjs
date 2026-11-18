// Synthetic OpenAI auth server. It never contacts auth.openai.com.
// Codes, tokens and the RSA key exist only inside this process.
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { connect as connectNet } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ISSUER, PLAN_SCOPE, REGISTRATION_ENTRYPOINT, SCOPES, b64urlEncode, s256 } from '../../src/siwc-auth.js';

export const ISSUED_CLIENT_ID = 'oaiapp_synthetic';
export const FIXTURE_EMAIL = 'synthetic@example.com';
export const FIXTURE_SUBJECT = 'synthetic-subject';

export async function createSiwcFixture({ planScope = true, exchangeError = null } = {}) {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const jwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  jwk.kid = 'siwc-fixture';
  jwk.alg = 'RS256';
  jwk.use = 'sig';
  const attempts = new Map();
  const spentRefresh = new Set();
  const counts = { authorize: 0, token: 0, refresh: 0, revoke: 0 };
  let serial = 0;

  function grantedScope() {
    if (planScope) return SCOPES;
    return SCOPES.split(' ').filter((scope) => scope !== PLAN_SCOPE).join(' ');
  }

  function begin(authorizeUrl) {
    const url = new URL(authorizeUrl);
    const state = url.searchParams.get('state');
    serial += 1;
    const code = `synthetic-code-${serial}`;
    attempts.set(state, {
      challenge: url.searchParams.get('code_challenge'),
      nonce: url.searchParams.get('nonce'),
      redirect: url.searchParams.get('redirect_uri'),
      requestedClientId: url.searchParams.get('client_id'),
      code,
    });
    counts.authorize += 1;
    const redirect = new URL(url.searchParams.get('redirect_uri'));
    redirect.searchParams.set('state', state);
    redirect.searchParams.set('code', code);
    redirect.searchParams.set('client_id', url.searchParams.get('client_id') === REGISTRATION_ENTRYPOINT ? ISSUED_CLIENT_ID : url.searchParams.get('client_id'));
    redirect.searchParams.set('scope', grantedScope());
    return redirect.toString();
  }

  async function sign(claims) {
    const header = b64urlEncode(new TextEncoder().encode(JSON.stringify({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })));
    const payload = b64urlEncode(new TextEncoder().encode(JSON.stringify(claims)));
    const signature = new Uint8Array(await crypto.subtle.sign(
      { name: 'RSASSA-PKCS1-v1_5' },
      pair.privateKey,
      new TextEncoder().encode(`${header}.${payload}`),
    ));
    return `${header}.${payload}.${b64urlEncode(signature)}`;
  }

  async function idToken(nonce, { exp = Math.floor(Date.now() / 1000) + 3600 } = {}) {
    return sign({
      iss: ISSUER,
      aud: ISSUED_CLIENT_ID,
      sub: FIXTURE_SUBJECT,
      email: FIXTURE_EMAIL,
      nonce,
      exp,
      iat: Math.floor(Date.now() / 1000),
    });
  }

  function json(status, body, extraHeaders = {}) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...extraHeaders },
    });
  }

  async function handleToken(body) {
    const params = new URLSearchParams(body);
    const grant = params.get('grant_type');
    if (exchangeError && grant === 'authorization_code') {
      counts.token += 1;
      return json(403, { error: exchangeError });
    }
    if (grant === 'authorization_code') {
      counts.token += 1;
      const found = [...attempts.values()].find((item) => item.code === params.get('code'));
      if (!found) return json(400, { error: 'invalid_grant' });
      if (params.get('client_id') === REGISTRATION_ENTRYPOINT || params.get('client_id') !== ISSUED_CLIENT_ID) {
        return json(400, { error: 'invalid_client' });
      }
      if (params.get('redirect_uri') !== found.redirect) return json(400, { error: 'invalid_grant' });
      if (await s256(params.get('code_verifier') ?? '') !== found.challenge) return json(400, { error: 'invalid_grant' });
      if (found.used) return json(400, { error: 'invalid_grant' });
      found.used = true;
      const refreshToken = `synthetic-refresh-token-${serial}`;
      return json(200, {
        access_token: `synthetic-access-token-${serial}`,
        refresh_token: refreshToken,
        id_token: await idToken(found.nonce),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: grantedScope(),
      });
    }
    if (grant === 'refresh_token') {
      counts.refresh += 1;
      const refreshToken = params.get('refresh_token');
      if (spentRefresh.has(refreshToken)) return json(400, { error: 'refresh_token_reused' });
      if (!refreshToken?.startsWith('synthetic-refresh-token-')) return json(400, { error: 'invalid_grant' });
      if (params.get('client_id') !== ISSUED_CLIENT_ID) return json(400, { error: 'invalid_client' });
      if (params.has('scope')) return json(400, { error: 'invalid_request' });
      spentRefresh.add(refreshToken);
      serial += 1;
      const next = `synthetic-refresh-token-${serial}`;
      return json(200, {
        access_token: `synthetic-access-token-${serial}`,
        refresh_token: next,
        id_token: await idToken('refresh-nonce'),
        token_type: 'Bearer',
        expires_in: 3600,
        scope: grantedScope(),
      });
    }
    return json(400, { error: 'unsupported_grant_type' });
  }

  async function handle({ url, method = 'GET', body = '' }) {
    const parsed = new URL(url, 'https://auth.openai.com');
    if (method === 'GET' && parsed.pathname === '/.well-known/openid-configuration') {
      return json(200, {
        issuer: ISSUER,
        authorization_endpoint: 'https://auth.openai.com/api/accounts/authorize',
        token_endpoint: 'https://auth.openai.com/api/accounts/oauth/token',
        jwks_uri: 'https://auth.openai.com/.well-known/jwks.json',
        revocation_endpoint: 'https://auth.openai.com/oauth/revoke',
      });
    }
    if (method === 'GET' && parsed.pathname === '/.well-known/jwks.json') return json(200, { keys: [jwk] });
    if (method === 'GET' && parsed.pathname === '/api/accounts/authorize') {
      const location = begin(parsed.toString());
      return new Response(null, { status: 302, headers: { location } });
    }
    if (method === 'POST' && parsed.pathname === '/api/accounts/oauth/token') return handleToken(body);
    if (method === 'POST' && parsed.pathname === '/oauth/revoke') {
      counts.revoke += 1;
      return new Response(null, { status: 200 });
    }
    return json(404, { error: 'not_found' });
  }

  function start() {
    const server = createHttpServer(async (req, res) => {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = Buffer.concat(chunks).toString('utf8');
      const response = await handle({ url: `https://auth.openai.com${req.url}`, method: req.method, body });
      const bytes = Buffer.from(await response.arrayBuffer());
      const headers = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      res.writeHead(response.status, headers);
      res.end(bytes);
    });
    return new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const { port } = server.address();
        resolve({
          port,
          close: () => new Promise((done) => server.close(() => done())),
        });
      });
    });
  }

  return {
    jwk,
    jwks: () => ({ keys: [jwk] }),
    sign,
    begin,
    handle,
    start,
    counts,
    issuedClientId: ISSUED_CLIENT_ID,
    email: FIXTURE_EMAIL,
    subject: FIXTURE_SUBJECT,
  };
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

// Browser proxy that terminates only auth.openai.com. Every other host is refused,
// so a test cannot fall through to the real authorization server.
export async function startAuthIntercept(fixture, { onRedirect } = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'lume-siwc-cert-'));
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '1', '-nodes',
    '-keyout', 'key.pem', '-out', 'cert.pem',
    '-subj', '/CN=auth.openai.com',
    '-addext', 'subjectAltName=DNS:auth.openai.com',
  ], { cwd: dir, stdio: 'ignore' });
  const cert = await readFile(join(dir, 'cert.pem'));
  const key = await readFile(join(dir, 'key.pem'));
  const httpsServer = createHttpsServer({ cert, key }, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const response = await fixture.handle({
      url: `https://auth.openai.com${req.url}`,
      method: req.method,
      body: Buffer.concat(chunks).toString('utf8'),
    });
    if (response.status === 302 && onRedirect) await onRedirect(response.headers.get('location'));
    const bytes = Buffer.from(await response.arrayBuffer());
    const headers = {};
    response.headers.forEach((value, name) => { headers[name] = value; });
    res.writeHead(response.status, headers);
    res.end(bytes);
  });
  const httpsPort = await listen(httpsServer);
  const proxy = createHttpServer((_req, res) => { res.writeHead(404).end(); });
  proxy.on('connect', (req, socket, head) => {
    const host = String(req.url ?? '').split(':')[0];
    if (host !== 'auth.openai.com') {
      socket.write('HTTP/1.1 403 Forbidden\r\n\r\n');
      socket.destroy();
      return;
    }
    const upstream = connectNet(httpsPort, '127.0.0.1');
    const kill = () => { socket.destroy(); upstream.destroy(); };
    upstream.once('connect', () => {
      socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head?.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on('error', kill);
    socket.on('error', kill);
  });
  const port = await listen(proxy);
  return {
    port,
    close: async () => {
      await new Promise((resolve) => proxy.close(() => resolve()));
      await new Promise((resolve) => httpsServer.close(() => resolve()));
      await rm(dir, { recursive: true, force: true });
    },
  };
}

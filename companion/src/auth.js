// Sign in with ChatGPT (open-source / token-sharing route) — the local, offline-checkable parts:
// per-user registration config, PKCE/state/nonce, authorize URL, and the loopback callback listener.
// Network calls (code exchange, refresh, revocation) are injected; nothing here contacts OpenAI.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { Secret } from './redact.js';

// Values from https://developers.openai.com/siwc/token-sharing-open-source/sign-in
export const AUTHORIZE_URL = 'https://auth.openai.com/api/accounts/authorize';
export const RESOURCE = 'https://api.openai.com/v1';
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
// Documented first-time registration entrypoint; it is NOT a client ID and is never used for token exchange.
export const REGISTRATION_ENTRYPOINT = 'dynamic_agent_client';
export const CALLBACK_HOST = '127.0.0.1';
export const CALLBACK_PATH = '/auth/callback';
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;

const HOST_ID_RE = /^(urn:ietf:params:oauth:jwk-thumbprint:[A-Za-z0-9:_-]+|urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|did:key:z[1-9A-HJ-NP-Za-km-z]+)$/;

export class AuthError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// A registration belongs to one ChatGPT account + workspace on this host. The client ID is the one
// OpenAI issued to this user; it is never shipped in source and never shared between users.
export function createRegistration({ hostId, clientId = null, agentName = 'Lume' } = {}) {
  if (typeof hostId !== 'string' || !HOST_ID_RE.test(hostId)) throw new AuthError('bad_config', 'hostId must be a documented ext_agent_host_id format');
  if (clientId !== null && (typeof clientId !== 'string' || clientId.length === 0 || clientId === REGISTRATION_ENTRYPOINT)) {
    throw new AuthError('bad_config', 'clientId must be the per-user issued client ID');
  }
  return Object.freeze({ hostId, clientId, agentName });
}

const b64url = (buf) => buf.toString('base64url');
export const s256 = (verifier) => b64url(createHash('sha256').update(verifier).digest());

export function createAttempt() {
  const verifier = b64url(randomBytes(32)); // 43 chars, within RFC 7636 43..128
  return {
    state: b64url(randomBytes(32)),
    nonce: b64url(randomBytes(32)),
    verifier: new Secret(verifier),
    challenge: s256(verifier),
  };
}

export function buildAuthorizeUrl(registration, attempt, redirectUri) {
  const p = new URLSearchParams({
    response_type: 'code',
    client_id: registration.clientId ?? REGISTRATION_ENTRYPOINT,
    redirect_uri: redirectUri,
    scope: SCOPES,
    resource: RESOURCE,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: attempt.challenge,
    code_challenge_method: 'S256',
  });
  if (registration.clientId === null) {
    p.set('agent_name_hint', registration.agentName);
    p.set('ext_agent_host_id', registration.hostId);
  }
  return `${AUTHORIZE_URL}?${p}`;
}

export const safeEqual = (a, b) => {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};

// Nonce check for an ID token whose signature was already verified by the caller.
export function checkNonce(idTokenClaims, attempt) {
  if (!idTokenClaims || !safeEqual(idTokenClaims.nonce ?? '', attempt.nonce)) throw new AuthError('nonce_mismatch', 'ID token nonce does not match');
}

export function checkPlanScope(grantedScope) {
  if (!String(grantedScope ?? '').split(' ').includes(PLAN_SCOPE)) throw new AuthError('plan_disabled', 'ChatGPT plan usage was not granted');
}

// Opens a one-shot listener on 127.0.0.1. Resolves with the authorization code after exactly one
// callback whose state matches, then closes. Wrong path/state does not consume the listener; an
// OAuth error with the right state ends the attempt. Timeout closes it and rejects.
export function startCallbackListener({ attempt, host = CALLBACK_HOST, port = 0, timeoutMs = DEFAULT_TIMEOUT_MS }) {
  if (host !== CALLBACK_HOST) return Promise.reject(new AuthError('non_loopback', 'callback listener binds only to 127.0.0.1'));
  return new Promise((resolveStart, rejectStart) => {
    let settle;
    const result = new Promise((res, rej) => (settle = { res, rej }));
    result.catch(() => {}); // caller observes via .result; avoid unhandled rejection if ignored
    let done = false;
    const server = createServer((req, res) => {
      const url = new URL(req.url, `http://${CALLBACK_HOST}`);
      if (done || req.method !== 'GET' || url.pathname !== CALLBACK_PATH) {
        res.writeHead(404).end();
        return;
      }
      if (!safeEqual(url.searchParams.get('state') ?? '', attempt.state)) {
        res.writeHead(400, { 'content-type': 'text/plain' }).end('Invalid sign-in response. Return to Lume and try again.');
        return;
      }
      done = true;
      const error = url.searchParams.get('error');
      const code = url.searchParams.get('code');
      res.writeHead(error || !code ? 400 : 200, { 'content-type': 'text/plain', connection: 'close' });
      res.end(error || !code ? 'Sign-in was not completed. Return to Lume.' : 'Sign-in received. You can close this tab.');
      finish(() => (error === 'access_denied' ? settle.rej(new AuthError('plan_disabled', 'consent was declined')) : error || !code ? settle.rej(new AuthError('oauth_error', 'authorization failed')) : settle.res(new Secret(code))));
    });
    const timer = setTimeout(() => {
      done = true;
      finish(() => settle.rej(new AuthError('timeout', 'sign-in timed out')));
    }, timeoutMs);
    function finish(then) {
      clearTimeout(timer);
      server.close();
      server.closeIdleConnections();
      then();
    }
    server.on('error', (e) => {
      clearTimeout(timer);
      rejectStart(e);
    });
    server.listen(port, CALLBACK_HOST, () => {
      const addr = server.address();
      resolveStart({
        redirectUri: `http://${CALLBACK_HOST}:${addr.port}${CALLBACK_PATH}`,
        port: addr.port,
        result,
        close: () => {
          if (!done) {
            done = true;
            finish(() => settle.rej(new AuthError('cancelled', 'sign-in cancelled')));
          }
        },
      });
    });
  });
}

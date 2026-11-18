// Sign in with ChatGPT for a local open-source app.
// Values and checks follow the OpenAI token-sharing docs (sign-in, sessions,
// token reference, errors). No client secret and no shipped client id.
// Network I/O is injected. This module does not listen on a port.

export const AUTHORIZE_URL = 'https://auth.openai.com/api/accounts/authorize';
export const TOKEN_URL = 'https://auth.openai.com/api/accounts/oauth/token';
export const OPENID_CONFIG_URL = 'https://auth.openai.com/.well-known/openid-configuration';
export const ISSUER = 'https://auth.openai.com';
export const RESOURCE = 'https://api.openai.com/v1';
export const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
export const PLAN_SCOPE = 'chatgpt.tokens.use.direct';
export const REGISTRATION_ENTRYPOINT = 'dynamic_agent_client';
export const CALLBACK_HOST = '127.0.0.1';
export const CALLBACK_PATH = '/auth/callback';
export const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
export const AGENT_NAME = 'Lume';
export const USAGE_URL = 'https://chatgpt.com/settings';
export const REFRESH_MARGIN_MS = 60 * 1000;

const HOST_ID_RE = /^(urn:ietf:params:oauth:jwk-thumbprint:[A-Za-z0-9:_-]+|urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|did:key:z[1-9A-HJ-NP-Za-km-z]+)$/;

export const TERMINAL_REFRESH_ERRORS = new Set([
  'invalid_grant',
  'invalid_refresh_token',
  'token_expired',
  'refresh_token_expired',
  'refresh_token_invalidated',
  'refresh_token_reused',
]);

export const MESSAGES = Object.freeze({
  signed_out: 'Você não está conectado. Clique em Entrar com ChatGPT.',
  not_eligible: 'O uso do plano ChatGPT não está disponível para esta conta, espaço de trabalho ou política. Não há correção no código do Lume.',
  no_plan_scope: 'A conta foi reconhecida, mas o uso do plano ChatGPT não foi autorizado. Clique em Entrar com ChatGPT e permita o uso do plano.',
  expired: 'A sessão do ChatGPT expirou. Clique em Entrar com ChatGPT de novo.',
  error: 'Não foi possível concluir o login. Clique em Entrar com ChatGPT e tente de novo.',
  timeout: 'O tempo para entrar se esgotou. Clique em Entrar com ChatGPT e conclua a autorização.',
  cancelled: 'A entrada foi cancelada.',
  access_denied: 'A autorização foi recusada. Clique em Entrar com ChatGPT e permita o uso do plano.',
  state_mismatch: 'A resposta de login não confere com este pedido. Clique em Entrar com ChatGPT de novo.',
  replay: 'Esta resposta de login já foi usada. Clique em Entrar com ChatGPT de novo.',
  forbidden_sender: 'Esta página não pode receber a sessão do ChatGPT.',
  logout_unconfirmed: 'A saída local foi feita, mas a revogação remota não foi confirmada. Desconecte o Lume nos Ajustes do ChatGPT.',
  quota_exhausted: 'O limite de uso do plano ChatGPT foi atingido. Abra Gerenciar uso para ver o limite deste aplicativo ou do plano. O Lume não muda a forma de cobrança.',
  usage_unavailable: 'Não foi possível verificar o uso do plano ChatGPT agora. Tente de novo em alguns minutos.',
  plan_disabled: 'O uso do plano ChatGPT não está permitido para o Lume. Entre de novo e autorize o uso do plano.',
  client_config: 'O registro desta conta no Lume está inválido. Saia e entre de novo.',
  auth_expired: 'A sessão do ChatGPT expirou ou foi desconectada. Clique em Entrar com ChatGPT de novo.',
});

export const PAUSE = Object.freeze({
  auth_expired: MESSAGES.auth_expired,
  quota_exhausted: MESSAGES.quota_exhausted,
  usage_unavailable: MESSAGES.usage_unavailable,
  not_eligible: MESSAGES.not_eligible,
  plan_disabled: MESSAGES.plan_disabled,
  client_config: MESSAGES.client_config,
});

const BY_CODE = Object.freeze({
  subscription_sharing_usage_limit_exceeded: 'quota_exhausted',
  subscription_sharing_usage_unavailable: 'usage_unavailable',
  subscription_sharing_user_not_eligible: 'not_eligible',
  subscription_sharing_invalid_user: 'auth_expired',
  auth_expired: 'auth_expired',
  plan_disabled: 'plan_disabled',
  no_plan_scope: 'plan_disabled',
  invalid_client: 'client_config',
  access_denied: 'plan_disabled',
});

export class AuthError extends Error {
  constructor(code, message = messageFor(code)) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

export function messageFor(code) {
  return MESSAGES[code] ?? MESSAGES.error;
}

export function pauseFor({ code, status } = {}) {
  const reason = BY_CODE[code] ?? (status === 401 ? 'auth_expired' : status === 429 ? 'quota_exhausted' : null);
  if (!reason) return null;
  return Object.freeze({
    state: 'paused',
    reason,
    message: PAUSE[reason],
    resumable: reason !== 'not_eligible',
  });
}

export function accessCode(code) {
  if (code === 'signed_out') return 'signed_out';
  if (code === 'not_eligible' || code === 'subscription_sharing_user_not_eligible') return 'not_eligible';
  if (code === 'no_plan_scope' || code === 'plan_disabled' || code === 'access_denied') return 'no_plan_scope';
  if (code === 'expired' || code === 'auth_expired' || code === 'cancelled' || TERMINAL_REFRESH_ERRORS.has(code)) return 'expired';
  return 'error';
}

export function scopeHasPlan(scope) {
  return String(scope ?? '').split(/[\s+]+/).filter(Boolean).includes(PLAN_SCOPE);
}

export function assertHostId(hostId) {
  if (typeof hostId !== 'string' || !HOST_ID_RE.test(hostId)) {
    throw new AuthError('bad_config', messageFor('error'));
  }
  return hostId;
}

export function b64urlEncode(bytes) {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

export function b64urlDecode(text) {
  const pad = text.length % 4 === 0 ? '' : '='.repeat(4 - (text.length % 4));
  const binary = atob(text.replaceAll('-', '+').replaceAll('_', '/') + pad);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

export function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a));
  const y = new TextEncoder().encode(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i += 1) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function s256(verifier) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64urlEncode(digest);
}

export function randomCallbackPort() {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return 49152 + (buf[0] % 16384);
}

export function redirectUri(port) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new AuthError('bad_config', messageFor('error'));
  return `http://${CALLBACK_HOST}:${port}${CALLBACK_PATH}`;
}

export async function createAttempt() {
  const verifierBytes = new Uint8Array(32);
  const stateBytes = new Uint8Array(32);
  const nonceBytes = new Uint8Array(32);
  crypto.getRandomValues(verifierBytes);
  crypto.getRandomValues(stateBytes);
  crypto.getRandomValues(nonceBytes);
  const verifier = b64urlEncode(verifierBytes);
  return {
    state: b64urlEncode(stateBytes),
    nonce: b64urlEncode(nonceBytes),
    verifier,
    challenge: await s256(verifier),
  };
}

export function buildAuthorizeUrl(registration, attempt, redirect) {
  assertHostId(registration.hostId);
  const redirectUrl = new URL(redirect);
  if (redirectUrl.protocol !== 'http:' || redirectUrl.hostname !== CALLBACK_HOST || redirectUrl.pathname !== CALLBACK_PATH) {
    throw new AuthError('non_loopback', messageFor('error'));
  }
  const first = registration.clientId == null;
  if (!first && (typeof registration.clientId !== 'string' || registration.clientId === '' || registration.clientId === REGISTRATION_ENTRYPOINT)) {
    throw new AuthError('bad_config', messageFor('client_config'));
  }
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: first ? REGISTRATION_ENTRYPOINT : registration.clientId,
    redirect_uri: redirectUrl.toString(),
    scope: SCOPES,
    resource: RESOURCE,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: attempt.challenge,
    code_challenge_method: 'S256',
    ext_agent_host_id: registration.hostId,
  });
  if (first) params.set('agent_name_hint', registration.agentName ?? AGENT_NAME);
  if (!first && registration.planDisabled === true) params.set('prompt', 'consent');
  if (!first && registration.idTokenHint) params.set('id_token_hint', registration.idTokenHint);
  if (!first && registration.loginHint) params.set('login_hint', registration.loginHint);
  return `${AUTHORIZE_URL}?${params}`;
}

export function acceptCallback(urlString, attempt, { pendingClientId = null } = {}) {
  let url;
  try {
    url = new URL(urlString);
  } catch {
    throw new AuthError('bad_redirect', messageFor('error'));
  }
  if (url.protocol !== 'http:' || url.hostname !== CALLBACK_HOST || url.pathname !== CALLBACK_PATH) {
    throw new AuthError('bad_redirect', messageFor('error'));
  }
  if (!safeEqual(url.searchParams.get('state') ?? '', attempt.state)) {
    throw new AuthError('state_mismatch', messageFor('state_mismatch'));
  }
  const error = url.searchParams.get('error');
  if (error === 'access_denied') throw new AuthError('access_denied', messageFor('access_denied'));
  if (error) throw new AuthError('oauth_error', messageFor('error'));
  const code = url.searchParams.get('code');
  if (!code) throw new AuthError('oauth_error', messageFor('error'));
  const returned = url.searchParams.get('client_id');
  let clientId = pendingClientId;
  if (pendingClientId == null) {
    if (!returned || returned === REGISTRATION_ENTRYPOINT) throw new AuthError('registration_incomplete', messageFor('error'));
    clientId = returned;
  } else if (returned && !safeEqual(returned, pendingClientId)) {
    throw new AuthError('client_mismatch', messageFor('error'));
  }
  return { code, clientId, scope: url.searchParams.get('scope') };
}

function assertAuthUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'auth.openai.com') throw new AuthError('bad_discovery', messageFor('error'));
  return url.toString();
}

function oauthErrorCode(json, status) {
  if (typeof json?.error === 'string' && json.error) return json.error;
  if (typeof json?.error?.code === 'string' && json.error.code) return json.error.code;
  if (typeof json?.code === 'string' && json.code) return json.code;
  if (status >= 500) return 'unavailable';
  if (status === 401) return 'auth_expired';
  return 'error';
}

async function readJson(res) {
  return res.json().catch(() => ({}));
}

export async function discoverOpenId(fetchImpl, signal) {
  const res = await fetchImpl(OPENID_CONFIG_URL, { signal, method: 'GET' });
  if (!res.ok) throw new AuthError(res.status >= 500 ? 'unavailable' : 'error', messageFor('error'));
  const json = await readJson(res);
  if (json.issuer !== ISSUER) throw new AuthError('bad_issuer', messageFor('error'));
  return {
    issuer: ISSUER,
    jwksUri: assertAuthUrl(json.jwks_uri),
    revocationEndpoint: assertAuthUrl(json.revocation_endpoint),
  };
}

export async function fetchJwks(jwksUri, fetchImpl, signal) {
  const res = await fetchImpl(assertAuthUrl(jwksUri), { signal, method: 'GET' });
  if (!res.ok) throw new AuthError(res.status >= 500 ? 'unavailable' : 'error', messageFor('error'));
  const json = await readJson(res);
  if (!Array.isArray(json.keys)) throw new AuthError('error', messageFor('error'));
  return json;
}

async function postForm(fetchImpl, url, params, signal) {
  let res;
  try {
    res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: params,
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') throw new AuthError('cancelled', messageFor('cancelled'));
    throw new AuthError('network', messageFor('error'));
  }
  const json = await readJson(res);
  if (!res.ok) throw new AuthError(oauthErrorCode(json, res.status), messageFor(accessCode(oauthErrorCode(json, res.status)) === 'not_eligible' ? 'not_eligible' : 'error'));
  return json;
}

export async function exchangeAuthorizationCode({ clientId, code, verifier, redirectUri: redirect, fetch: fetchImpl, signal, tokenUrl = TOKEN_URL }) {
  if (!clientId || clientId === REGISTRATION_ENTRYPOINT) throw new AuthError('bad_config', messageFor('client_config'));
  const json = await postForm(fetchImpl, tokenUrl, new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: clientId,
    code,
    code_verifier: verifier,
    redirect_uri: redirect,
    resource: RESOURCE,
  }), signal);
  if (!json.access_token || !json.id_token || !json.expires_in) throw new AuthError('bad_token_response', messageFor('error'));
  return json;
}

export async function refreshAccessToken({ clientId, refreshToken, fetch: fetchImpl, signal, tokenUrl = TOKEN_URL }) {
  if (!clientId || clientId === REGISTRATION_ENTRYPOINT) throw new AuthError('bad_config', messageFor('client_config'));
  const json = await postForm(fetchImpl, tokenUrl, new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: refreshToken,
    resource: RESOURCE,
  }), signal);
  if (!json.access_token || !json.refresh_token || !json.expires_in) throw new AuthError('bad_token_response', messageFor('error'));
  return json;
}

export async function revokeRefreshToken({ endpoint, token, clientId, fetch: fetchImpl, signal }) {
  let res;
  try {
    res = await fetchImpl(assertAuthUrl(endpoint), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        token,
        token_type_hint: 'refresh_token',
        client_id: clientId,
      }),
      signal,
    });
  } catch (error) {
    if (error?.name === 'AbortError') return { confirmed: false, status: 0 };
    return { confirmed: false, status: 0 };
  }
  return { confirmed: res.status === 200, status: res.status };
}

function selectJwk(jwks, kid) {
  const keys = (jwks?.keys ?? []).filter((key) => key?.kty === 'RSA' && (key.use == null || key.use === 'sig') && (key.alg == null || key.alg === 'RS256'));
  const matches = kid ? keys.filter((key) => key.kid === kid) : keys;
  if (matches.length !== 1) throw new AuthError('bad_signature', messageFor('error'));
  return matches[0];
}

export async function verifyIdToken(idToken, { jwks, audience, nonce, now = Date.now(), checkNonce = true } = {}) {
  if (typeof idToken !== 'string' || idToken.length > 20000) throw new AuthError('bad_id_token', messageFor('error'));
  const parts = idToken.split('.');
  if (parts.length !== 3 || parts.some((part) => part === '')) throw new AuthError('bad_id_token', messageFor('error'));
  let header;
  let claims;
  try {
    header = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[0])));
    claims = JSON.parse(new TextDecoder().decode(b64urlDecode(parts[1])));
  } catch {
    throw new AuthError('bad_id_token', messageFor('error'));
  }
  if (header.alg !== 'RS256' || header.crit != null) throw new AuthError('bad_signature', messageFor('error'));
  const jwk = selectJwk(jwks, header.kid);
  const key = await crypto.subtle.importKey(
    'jwk',
    { kty: 'RSA', n: jwk.n, e: jwk.e, alg: 'RS256', ext: true },
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify'],
  );
  const ok = await crypto.subtle.verify(
    { name: 'RSASSA-PKCS1-v1_5' },
    key,
    b64urlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!ok) throw new AuthError('bad_signature', messageFor('error'));
  if (claims.iss !== ISSUER) throw new AuthError('bad_issuer', messageFor('error'));
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audience || !aud.includes(audience)) throw new AuthError('bad_audience', messageFor('error'));
  if (typeof claims.exp !== 'number' || claims.exp * 1000 <= now) throw new AuthError('expired', messageFor('expired'));
  if (checkNonce && !safeEqual(claims.nonce ?? '', nonce ?? '')) throw new AuthError('nonce_mismatch', messageFor('error'));
  if (typeof claims.sub !== 'string' || claims.sub === '') throw new AuthError('bad_id_token', messageFor('error'));
  return claims;
}

export function senderAllowed(sender, extensionId) {
  if (!sender || sender.id !== extensionId || typeof sender.url !== 'string') return false;
  let url;
  try {
    url = new URL(sender.url);
  } catch {
    return false;
  }
  if (url.protocol !== 'chrome-extension:' || url.host !== extensionId) return false;
  return url.pathname === '/study.html' || url.pathname === '/panel.html';
}

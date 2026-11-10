// Session custody for Sign in with ChatGPT.
// Tokens live in chrome.storage.session (trusted contexts) or nowhere.
// chrome.storage.local keeps only the host id, the issued client id, and the email.
// The worker is the only refresher. The loopback redirect is caught from a tab;
// nothing here binds a port.

import {
  AGENT_NAME,
  AuthError,
  DEFAULT_TIMEOUT_MS,
  MESSAGES,
  REFRESH_MARGIN_MS,
  TERMINAL_REFRESH_ERRORS,
  acceptCallback,
  accessCode,
  assertHostId,
  buildAuthorizeUrl,
  createAttempt,
  discoverOpenId,
  exchangeAuthorizationCode,
  fetchJwks,
  messageFor,
  randomCallbackPort,
  redirectUri,
  refreshAccessToken,
  revokeRefreshToken,
  scopeHasPlan,
  senderAllowed,
  verifyIdToken,
} from './siwc-auth.js';

export const LOCAL_KEYS = Object.freeze({
  hostId: 'lume.siwc.hostId',
  clientId: 'lume.siwc.clientId',
  email: 'lume.siwc.email',
});
export const SESSION_KEY = 'lume.siwc.session';
export const SIWC_TYPES = new Set(['lume:siwc-status', 'lume:siwc-login', 'lume:siwc-logout', 'lume:siwc-access']);
const REVOKE_DELAYS_MS = [200, 400];

export function createSiwcSession(deps) {
  const {
    local,
    session,
    extensionId,
    tabs,
    fetch: fetchImpl,
    now = () => Date.now(),
    timeoutMs = DEFAULT_TIMEOUT_MS,
    sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    randomPort = randomCallbackPort,
    setAccessLevel,
  } = deps;

  let generation = 0;
  let trusted = false;
  let pending = null;
  let refreshFlight = null;
  let discovery = null;
  let lastLogout = null;
  const usedCodes = new Set();

  const trustReady = Promise.resolve().then(async () => {
    if (typeof setAccessLevel !== 'function') throw new Error('missing session access level');
    await setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    trusted = true;
  }).catch(() => {
    trusted = false;
  });

  async function readAccount() {
    const stored = await local.get([LOCAL_KEYS.hostId, LOCAL_KEYS.clientId, LOCAL_KEYS.email]);
    return {
      hostId: stored?.[LOCAL_KEYS.hostId] ?? null,
      clientId: stored?.[LOCAL_KEYS.clientId] ?? null,
      email: stored?.[LOCAL_KEYS.email] ?? null,
    };
  }

  async function writeLocal(partial) {
    const next = {};
    if (partial.hostId !== undefined) next[LOCAL_KEYS.hostId] = partial.hostId;
    if (partial.clientId !== undefined) next[LOCAL_KEYS.clientId] = partial.clientId;
    if (partial.email !== undefined) next[LOCAL_KEYS.email] = partial.email;
    if (Object.keys(next).length > 0) await local.set(next);
  }

  async function readSession() {
    await trustReady;
    if (!trusted) return null;
    const stored = await session.get(SESSION_KEY);
    const value = stored?.[SESSION_KEY];
    if (!value || typeof value !== 'object') return null;
    return value;
  }

  async function writeSession(record) {
    await trustReady;
    if (!trusted) throw new AuthError('error', messageFor('error'));
    await session.set({ [SESSION_KEY]: record });
  }

  async function clearSession() {
    refreshFlight = null;
    await session.remove(SESSION_KEY);
  }

  async function ensureHostId() {
    const account = await readAccount();
    if (typeof account.hostId === 'string') {
      try {
        return assertHostId(account.hostId);
      } catch {
        /* replace a value that is not a documented host id */
      }
    }
    const hostId = `urn:uuid:${crypto.randomUUID()}`;
    await writeLocal({ hostId });
    return hostId;
  }

  function publicStatus(extra = {}) {
    return {
      ok: extra.ok !== false,
      signedIn: Boolean(extra.signedIn),
      email: extra.email ?? null,
      planEnabled: Boolean(extra.planEnabled),
      code: extra.code ?? null,
      message: extra.message ?? null,
      remoteRevocationConfirmed: extra.remoteRevocationConfirmed ?? null,
    };
  }

  async function status() {
    const account = await readAccount();
    const current = await readSession();
    if (!current) {
      return publicStatus({
        signedIn: false,
        email: account.email,
        message: lastLogout?.confirmed === false ? MESSAGES.logout_unconfirmed : null,
        remoteRevocationConfirmed: lastLogout ? lastLogout.confirmed : null,
        code: lastLogout?.confirmed === false ? 'error' : null,
      });
    }
    return publicStatus({
      signedIn: true,
      email: account.email,
      planEnabled: current.planEnabled === true,
      code: current.planEnabled ? null : 'no_plan_scope',
      message: current.planEnabled ? null : MESSAGES.no_plan_scope,
    });
  }

  function closeTab(tabId) {
    if (tabId == null) return Promise.resolve();
    return Promise.resolve(tabs.remove(tabId)).catch(() => {});
  }

  function finishPending(attempt, error) {
    if (!attempt || attempt.settled) return;
    attempt.settled = true;
    clearTimeout(attempt.timer);
    pending = null;
    closeTab(attempt.tabId);
    attempt.abort?.abort();
    if (error) attempt.reject(error);
    else attempt.resolve();
  }

  async function login() {
    if (pending && !pending.settled) return pending.result;
    await trustReady;
    if (!trusted) return failStatus('error');
    const hostId = await ensureHostId();
    const account = await readAccount();
    const current = await readSession();
    const attempt = await createAttempt();
    const port = randomPort();
    const redirect = redirectUri(port);
    const authorizeUrl = buildAuthorizeUrl({
      hostId,
      clientId: account.clientId,
      agentName: AGENT_NAME,
      planDisabled: current?.planEnabled === false,
      idTokenHint: current?.idToken ?? null,
      loginHint: account.email,
    }, attempt, redirect);
    let resolve;
    let reject;
    const result = new Promise((res, rej) => {
      resolve = res;
      reject = rej;
    });
    const slot = {
      attempt,
      redirectUri: redirect,
      clientId: account.clientId,
      tabId: null,
      settled: false,
      consumed: false,
      generation,
      abort: null,
      result: result.then(() => status(), (error) => failStatus(error?.code || 'error')),
      resolve,
      reject,
      timer: null,
    };
    slot.timer = setTimeout(() => finishPending(slot, new AuthError('timeout')), timeoutMs);
    pending = slot;
    try {
      const tab = await tabs.create({ url: authorizeUrl });
      slot.tabId = tab?.id ?? null;
    } catch {
      finishPending(slot, new AuthError('error'));
    }
    return slot.result;
  }

  function onBeforeNavigate(details) {
    if (details?.frameId != null && details.frameId !== 0) return 'ignored';
    let url;
    try {
      url = new URL(details?.url ?? '');
    } catch {
      return 'ignored';
    }
    if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.pathname !== '/auth/callback') return 'ignored';
    const code = url.searchParams.get('code');
    if (code && usedCodes.has(code)) return 'replay';
    const attempt = pending;
    if (!attempt || attempt.settled) return 'ignored';
    const expected = new URL(attempt.redirectUri);
    if (url.origin !== expected.origin || url.pathname !== expected.pathname) return 'ignored';
    if (attempt.tabId != null && details.tabId !== attempt.tabId) return 'ignored';
    let parsed;
    try {
      parsed = acceptCallback(url.toString(), attempt.attempt, { pendingClientId: attempt.clientId });
    } catch (error) {
      if (error?.code === 'state_mismatch') return 'state_mismatch';
      attempt.consumed = true;
      finishPending(attempt, error instanceof AuthError ? error : new AuthError('error'));
      return error?.code || 'error';
    }
    if (attempt.consumed || usedCodes.has(parsed.code)) return 'replay';
    attempt.consumed = true;
    usedCodes.add(parsed.code);
    closeTab(attempt.tabId);
    attempt.abort = new AbortController();
    void complete(attempt, parsed);
    return 'accepted';
  }

  async function complete(attempt, parsed) {
    const gen = attempt.generation;
    const stale = () => attempt.settled || attempt.generation !== generation || gen !== generation;
    try {
      discovery = await discoverOpenId(fetchImpl, attempt.abort.signal);
      const jwks = await fetchJwks(discovery.jwksUri, fetchImpl, attempt.abort.signal);
      const token = await exchangeAuthorizationCode({
        clientId: parsed.clientId,
        code: parsed.code,
        verifier: attempt.attempt.verifier,
        redirectUri: attempt.redirectUri,
        fetch: fetchImpl,
        signal: attempt.abort.signal,
      });
      if (stale()) return;
      const claims = await verifyIdToken(token.id_token, {
        jwks,
        audience: parsed.clientId,
        nonce: attempt.attempt.nonce,
        now: now(),
      });
      if (stale()) return;
      const record = {
        accessToken: token.access_token,
        refreshToken: token.refresh_token ?? null,
        idToken: token.id_token,
        expiresAt: now() + Number(token.expires_in) * 1000,
        scope: String(token.scope ?? ''),
        accountId: claims.sub,
        planEnabled: scopeHasPlan(token.scope),
        notEligible: false,
      };
      const email = typeof claims.email === 'string' && claims.email.includes('@') ? claims.email : undefined;
      await writeLocal({ clientId: parsed.clientId, email });
      if (stale()) return;
      await writeSession(record);
      if (stale()) {
        await clearSession();
        return;
      }
      lastLogout = null;
      finishPending(attempt, null);
    } catch (error) {
      if (stale()) return;
      const code = error instanceof AuthError ? error.code : 'error';
      if (code === 'subscription_sharing_user_not_eligible') {
        finishPending(attempt, new AuthError('not_eligible'));
        return;
      }
      finishPending(attempt, error instanceof AuthError ? error : new AuthError('error'));
    }
  }

  async function confirmRevoke(refreshToken, clientId) {
    if (!refreshToken || !clientId) return false;
    if (!discovery) discovery = await discoverOpenId(fetchImpl).catch(() => null);
    if (!discovery?.revocationEndpoint) return false;
    for (let i = 0; i < REVOKE_DELAYS_MS.length + 1; i += 1) {
      const result = await revokeRefreshToken({
        endpoint: discovery.revocationEndpoint,
        token: refreshToken,
        clientId,
        fetch: fetchImpl,
      });
      if (result.confirmed) return true;
      if (result.status >= 400 && result.status < 500) return false;
      if (i < REVOKE_DELAYS_MS.length) await sleep(REVOKE_DELAYS_MS[i]);
    }
    return false;
  }

  async function logout() {
    generation += 1;
    const attempt = pending;
    if (attempt && !attempt.settled) finishPending(attempt, new AuthError('cancelled'));
    const account = await readAccount();
    const current = await readSession().catch(() => null);
    let confirmed = true;
    if (current?.refreshToken) {
      confirmed = await confirmRevoke(current.refreshToken, account.clientId);
    }
    await clearSession();
    lastLogout = { confirmed };
    const base = await status();
    return { ...base, ok: true, remoteRevocationConfirmed: confirmed, message: confirmed ? null : MESSAGES.logout_unconfirmed, code: confirmed ? null : 'error' };
  }

  async function refreshOnce() {
    refreshFlight ??= doRefresh().finally(() => {
      refreshFlight = null;
    });
    return refreshFlight;
  }

  async function doRefresh() {
    const gen = generation;
    const account = await readAccount();
    const current = await readSession();
    if (!current?.refreshToken || !account.clientId) throw new AuthError('signed_out');
    if (!discovery) discovery = await discoverOpenId(fetchImpl);
    let resp;
    try {
      resp = await refreshAccessToken({
        clientId: account.clientId,
        refreshToken: current.refreshToken,
        fetch: fetchImpl,
      });
    } catch (error) {
      if (gen !== generation) throw new AuthError('cancelled');
      if (TERMINAL_REFRESH_ERRORS.has(error?.code) || error?.code === 'bad_token_response') {
        await clearSession();
        throw new AuthError('expired');
      }
      throw error instanceof AuthError ? error : new AuthError('error');
    }
    if (gen !== generation) throw new AuthError('cancelled');
    let idToken = current.idToken;
    let accountId = current.accountId;
    if (resp.id_token) {
      try {
        const jwks = await fetchJwks(discovery.jwksUri, fetchImpl);
        const claims = await verifyIdToken(resp.id_token, {
          jwks,
          audience: account.clientId,
          now: now(),
          checkNonce: false,
        });
        if (claims.sub !== current.accountId) {
          await confirmRevoke(resp.refresh_token, account.clientId);
          await clearSession();
          throw new AuthError('expired');
        }
        idToken = resp.id_token;
        accountId = claims.sub;
      } catch (error) {
        if (error instanceof AuthError && error.code === 'expired') throw error;
        await clearSession();
        throw new AuthError('expired');
      }
    }
    const record = {
      accessToken: resp.access_token,
      refreshToken: resp.refresh_token,
      idToken,
      expiresAt: now() + Number(resp.expires_in) * 1000,
      scope: String(resp.scope ?? ''),
      accountId,
      planEnabled: scopeHasPlan(resp.scope),
      notEligible: false,
    };
    if (gen !== generation) throw new AuthError('cancelled');
    await writeSession(record);
    if (gen !== generation) {
      await clearSession();
      throw new AuthError('cancelled');
    }
    return record;
  }

  async function access(sender) {
    if (!senderAllowed(sender, extensionId)) {
      return { ok: false, code: 'error', message: MESSAGES.forbidden_sender };
    }
    await trustReady;
    if (!trusted) return { ok: false, code: 'error', message: MESSAGES.error };
    let current = await readSession();
    if (!current) return { ok: false, code: 'signed_out', message: MESSAGES.signed_out };
    if (current.notEligible) return { ok: false, code: 'not_eligible', message: MESSAGES.not_eligible };
    if (current.planEnabled !== true) return { ok: false, code: 'no_plan_scope', message: MESSAGES.no_plan_scope };
    if (current.expiresAt - REFRESH_MARGIN_MS <= now()) {
      if (!current.refreshToken) {
        await clearSession();
        return { ok: false, code: 'expired', message: MESSAGES.expired };
      }
      try {
        current = await refreshOnce();
      } catch (error) {
        const code = accessCode(error?.code);
        return { ok: false, code, message: messageFor(code === 'expired' ? 'expired' : code) };
      }
    }
    if (!current || current.planEnabled !== true) {
      return { ok: false, code: 'no_plan_scope', message: MESSAGES.no_plan_scope };
    }
    return {
      ok: true,
      accessToken: current.accessToken,
      accountId: current.accountId,
      expiresAt: current.expiresAt,
    };
  }

  function failStatus(code) {
    const known = Object.hasOwn(MESSAGES, code) ? code : accessCode(code);
    return publicStatus({
      ok: false,
      signedIn: false,
      code: known,
      message: messageFor(known),
    });
  }

  function refused() {
    return { ok: false, code: 'error', message: MESSAGES.forbidden_sender, signedIn: false, planEnabled: false, email: null, remoteRevocationConfirmed: null };
  }

  async function handleMessage(type, sender) {
    if (!senderAllowed(sender, extensionId)) return refused();
    if (type === 'lume:siwc-status') return status();
    if (type === 'lume:siwc-login') return login();
    if (type === 'lume:siwc-logout') return logout();
    if (type === 'lume:siwc-access') return access(sender);
    return failStatus('error');
  }

  return {
    status,
    login,
    logout,
    access,
    onBeforeNavigate,
    handleMessage,
    ensureHostId,
    writeLocal,
  };
}

export function installSiwc(chromeApi = globalThis.chrome) {
  const session = createSiwcSession({
    local: chromeApi.storage.local,
    session: chromeApi.storage.session,
    extensionId: chromeApi.runtime.id,
    tabs: chromeApi.tabs,
    fetch: globalThis.fetch.bind(globalThis),
    setAccessLevel: (opts) => chromeApi.storage.session.setAccessLevel(opts),
  });
  // Chrome reports the loopback redirect on onBeforeNavigate when it emits one,
  // and on onErrorOccurred when nothing is listening (the callback port is closed).
  // onCommitted covers a browser that still commits the failed navigation.
  // One handler serves all three; a repeated event is a replay.
  const catchCallback = (details) => {
    session.onBeforeNavigate(details);
  };
  chromeApi.webNavigation.onBeforeNavigate.addListener(catchCallback);
  chromeApi.webNavigation.onCommitted.addListener(catchCallback);
  chromeApi.webNavigation.onErrorOccurred.addListener(catchCallback);
  chromeApi.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!SIWC_TYPES.has(msg?.type)) return;
    session.handleMessage(msg.type, sender).then(sendResponse, () => {
      sendResponse({ ok: false, code: 'error', message: MESSAGES.error });
    });
    return true;
  });
  return session;
}

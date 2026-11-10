import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SCOPES } from '../src/siwc-auth.js';
import { LOCAL_KEYS, SESSION_KEY, createSiwcSession, installSiwc } from '../src/siwc-session.js';
import { FIXTURE_SUBJECT, createSiwcFixture } from './fixtures/siwc-auth-server.mjs';

const EXT = 'odjfiioakpihgkikmjadmohgckkhkjhi';
const HOST = 'urn:uuid:123e4567-e89b-42d3-a456-426614174000';

function area() {
  const data = new Map();
  return {
    data,
    async get(keys) {
      if (keys == null) return Object.fromEntries(data);
      const list = typeof keys === 'string' ? [keys] : keys;
      const out = {};
      for (const key of list) if (data.has(key)) out[key] = data.get(key);
      return out;
    },
    async set(obj) {
      for (const [key, value] of Object.entries(obj)) data.set(key, structuredClone(value));
    },
    async remove(keys) {
      const list = typeof keys === 'string' ? [keys] : keys;
      for (const key of list) data.delete(key);
    },
  };
}

function panelSender(path = 'panel.html') {
  return { id: EXT, url: `chrome-extension://${EXT}/${path}` };
}

async function until(fn) {
  for (let i = 0; i < 50; i += 1) {
    if (await fn()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('timed out');
}

async function setup(options = {}) {
  const fixture = options.fixture ?? await createSiwcFixture(options.fixtureOptions);
  const local = area();
  const session = area();
  const opened = [];
  const accessLevel = [];
  const clock = { now: 1_700_000_000_000 };
  let port = 47000;
  let fetchImpl = options.fetch ?? ((url, opts = {}) => fixture.handle({
    url: String(url),
    method: opts.method ?? 'GET',
    body: opts.body?.toString?.() ?? '',
  }));
  const siwc = createSiwcSession({
    local,
    session,
    extensionId: EXT,
    tabs: {
      async create({ url }) {
        const tab = { id: opened.length + 1, url };
        opened.push(tab);
        return tab;
      },
      async remove(id) {
        const index = opened.findIndex((tab) => tab.id === id);
        if (index >= 0) opened.splice(index, 1);
      },
    },
    fetch: (url, opts) => fetchImpl(url, opts),
    now: () => clock.now,
    timeoutMs: options.timeoutMs ?? 5000,
    sleep: async () => {},
    randomPort: () => {
      port += 1;
      return port;
    },
    setAccessLevel: async (opts) => {
      accessLevel.push(opts);
    },
  });
  return {
    fixture,
    local,
    session,
    opened,
    accessLevel,
    clock,
    siwc,
    setFetch(fn) { fetchImpl = fn; },
  };
}

async function signIn(ctx) {
  const pending = ctx.siwc.login();
  await until(() => ctx.opened.length === 1);
  const callback = ctx.fixture.begin(ctx.opened[0].url);
  const verdict = ctx.siwc.onBeforeNavigate({ frameId: 0, tabId: ctx.opened[0].id, url: callback });
  assert.equal(verdict, 'accepted');
  return { status: await pending, callback };
}

test('trusted session storage receives the login and local storage does not', async () => {
  const ctx = await setup();
  await ctx.siwc.status();
  assert.deepEqual(ctx.accessLevel, [{ accessLevel: 'TRUSTED_CONTEXTS' }]);
  const { status, callback } = await signIn(ctx);
  assert.equal(status.signedIn, true);
  assert.equal(status.planEnabled, true);
  assert.equal(status.email, 'synthetic@example.com');
  assert.equal(status.message, null);
  assert.equal(ctx.siwc.onBeforeNavigate({ frameId: 0, tabId: 1, url: callback }), 'replay');
  assert.equal(ctx.fixture.counts.token, 1);
  const localBlob = JSON.stringify(Object.fromEntries(ctx.local.data));
  const stored = ctx.session.data.get(SESSION_KEY);
  assert.equal(localBlob.includes(stored.accessToken), false);
  assert.equal(localBlob.includes(stored.refreshToken), false);
  assert.equal(localBlob.includes(stored.idToken), false);
  assert.deepEqual(Object.keys(Object.fromEntries(ctx.local.data)).sort(), [LOCAL_KEYS.clientId, LOCAL_KEYS.email, LOCAL_KEYS.hostId]);
  const replayUrl = new URL(ctx.opened[0]?.url ?? callback);
  assert.equal(replayUrl.hostname === '127.0.0.1' || callback.includes('127.0.0.1'), true);
});

test('a wrong state does not consume the attempt, and timeout and cancel do not exchange', async () => {
  const mismatch = await setup();
  const pending = mismatch.siwc.login();
  await until(() => mismatch.opened.length === 1);
  const callback = mismatch.fixture.begin(mismatch.opened[0].url);
  const wrong = new URL(callback);
  wrong.searchParams.set('state', 'not-the-state');
  assert.equal(mismatch.siwc.onBeforeNavigate({ frameId: 0, tabId: mismatch.opened[0].id, url: wrong.toString() }), 'state_mismatch');
  assert.equal(mismatch.siwc.onBeforeNavigate({ frameId: 0, tabId: mismatch.opened[0].id, url: callback }), 'accepted');
  assert.equal((await pending).planEnabled, true);
  assert.equal(mismatch.fixture.counts.token, 1);

  const timed = await setup({ timeoutMs: 80 });
  const timedLogin = timed.siwc.login();
  await until(() => timed.opened.length === 1);
  const timedStatus = await timedLogin;
  assert.equal(timedStatus.code, 'timeout');
  assert.equal(timed.fixture.counts.token, 0);
  assert.equal(timed.opened.length, 0);

  const cancelled = await setup();
  const cancelLogin = cancelled.siwc.login();
  await until(() => cancelled.opened.length === 1);
  const authorize = cancelled.opened[0].url;
  const loggedOut = await cancelled.siwc.logout();
  assert.equal(loggedOut.remoteRevocationConfirmed, true);
  assert.equal((await cancelLogin).code, 'cancelled');
  const late = cancelled.fixture.begin(authorize);
  assert.equal(cancelled.siwc.onBeforeNavigate({ frameId: 0, tabId: 1, url: late }), 'ignored');
  assert.equal(cancelled.fixture.counts.token, 0);
});

test('logout during the token exchange discards the result', async () => {
  const fixture = await createSiwcFixture();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let waiting = false;
  const ctx = await setup({
    fixture,
    fetch: async (url, opts = {}) => {
      const body = opts.body?.toString?.() ?? '';
      if (String(url).includes('/oauth/token') && body.includes('authorization_code')) {
        opts.signal?.addEventListener('abort', () => release());
        waiting = true;
        await gate;
        if (opts.signal?.aborted) {
          const error = new Error('aborted');
          error.name = 'AbortError';
          throw error;
        }
      }
      return fixture.handle({ url: String(url), method: opts.method ?? 'GET', body });
    },
  });
  const pending = ctx.siwc.login();
  await until(() => ctx.opened.length === 1);
  assert.equal(ctx.siwc.onBeforeNavigate({
    frameId: 0,
    tabId: ctx.opened[0].id,
    url: fixture.begin(ctx.opened[0].url),
  }), 'accepted');
  await until(() => waiting);
  const loggedOut = await ctx.siwc.logout();
  assert.equal((await pending).code, 'cancelled');
  assert.equal(loggedOut.remoteRevocationConfirmed, true);
  assert.equal(ctx.fixture.counts.token, 0);
  assert.equal(ctx.session.data.has(SESSION_KEY), false);
  const localBlob = JSON.stringify(Object.fromEntries(ctx.local.data));
  assert.equal(localBlob.includes('synthetic-access-token'), false);
  assert.equal(localBlob.includes('synthetic-refresh-token'), false);
});

test('refresh is single-flight, a reused refresh token signs the user out, and a network error keeps it', async () => {
  const ctx = await setup();
  ctx.local.data.set(LOCAL_KEYS.hostId, HOST);
  ctx.local.data.set(LOCAL_KEYS.clientId, ctx.fixture.issuedClientId);
  ctx.local.data.set(LOCAL_KEYS.email, ctx.fixture.email);
  ctx.session.data.set(SESSION_KEY, {
    accessToken: 'synthetic-access-token-old',
    refreshToken: 'synthetic-refresh-token-seed',
    idToken: 'stored-id-token',
    expiresAt: ctx.clock.now - 1000,
    scope: SCOPES,
    accountId: FIXTURE_SUBJECT,
    planEnabled: true,
    notEligible: false,
  });
  const sender = panelSender();
  const [first, second] = await Promise.all([ctx.siwc.access(sender), ctx.siwc.access(sender)]);
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(first.accessToken, second.accessToken);
  assert.equal(ctx.fixture.counts.refresh, 1);
  assert.equal(first.accountId, FIXTURE_SUBJECT);
  const saved = ctx.session.data.get(SESSION_KEY).refreshToken;
  ctx.session.data.set(SESSION_KEY, { ...ctx.session.data.get(SESSION_KEY), refreshToken: 'synthetic-refresh-token-seed', expiresAt: ctx.clock.now - 1000 });
  const reused = await ctx.siwc.access(sender);
  assert.equal(reused.ok, false);
  assert.equal(reused.code, 'expired');
  assert.equal(reused.accessToken, undefined);
  assert.equal(ctx.session.data.has(SESSION_KEY), false);

  const flaky = await setup();
  flaky.local.data.set(LOCAL_KEYS.hostId, HOST);
  flaky.local.data.set(LOCAL_KEYS.clientId, flaky.fixture.issuedClientId);
  flaky.session.data.set(SESSION_KEY, {
    accessToken: 'synthetic-access-token-old',
    refreshToken: 'synthetic-refresh-token-seed',
    idToken: 'stored-id-token',
    expiresAt: flaky.clock.now - 1000,
    scope: SCOPES,
    accountId: FIXTURE_SUBJECT,
    planEnabled: true,
    notEligible: false,
  });
  flaky.setFetch(async () => { throw new Error('offline'); });
  const network = await flaky.siwc.access(sender);
  assert.equal(network.ok, false);
  assert.equal(network.code, 'error');
  assert.equal(flaky.session.data.get(SESSION_KEY).refreshToken, 'synthetic-refresh-token-seed');
  assert.equal(saved.startsWith('synthetic-refresh-token-'), true);
});

test('only the panel and study pages receive an access token', async () => {
  const ctx = await setup();
  ctx.local.data.set(LOCAL_KEYS.clientId, 'oaiapp_synthetic');
  ctx.session.data.set(SESSION_KEY, {
    accessToken: 'synthetic-access-token-live',
    refreshToken: 'synthetic-refresh-token-seed',
    idToken: 'stored-id-token',
    expiresAt: ctx.clock.now + 3_600_000,
    scope: SCOPES,
    accountId: FIXTURE_SUBJECT,
    planEnabled: true,
    notEligible: false,
  });
  const study = await ctx.siwc.handleMessage('lume:siwc-access', { id: EXT, url: `chrome-extension://${EXT}/study.html?id=abc&attach=0` });
  const panel = await ctx.siwc.access(panelSender());
  assert.equal(study.ok, true);
  assert.equal(study.accessToken, 'synthetic-access-token-live');
  assert.equal(panel.accessToken, study.accessToken);
  const refused = [
    { id: EXT, url: 'https://pje1g.trf1.jus.br/pje/Processo', tab: { id: 4 } },
    { id: 'other-extension', url: 'chrome-extension://other-extension/study.html' },
    { id: EXT, url: `chrome-extension://${EXT}/worker.js` },
    { id: EXT, url: `chrome-extension://someone-else/panel.html` },
  ];
  for (const sender of refused) {
    const reply = await ctx.siwc.handleMessage('lume:siwc-access', sender);
    assert.equal(reply.ok, false);
    assert.equal(reply.code, 'error');
    assert.equal(JSON.stringify(reply).includes('synthetic-access-token-live'), false);
  }
  const login = await ctx.siwc.handleMessage('lume:siwc-login', { id: EXT, url: 'https://pje1g.trf1.jus.br/x', tab: { id: 1 } });
  assert.equal(login.ok, false);
  assert.equal(ctx.opened.length, 0);
});

test('identity-only consent does not enable inference, and an ineligible account has no code fix', async () => {
  const identity = await setup({ fixtureOptions: { planScope: false } });
  const status = (await signIn(identity)).status;
  assert.equal(status.signedIn, true);
  assert.equal(status.planEnabled, false);
  assert.equal(status.code, 'no_plan_scope');
  const reply = await identity.siwc.access(panelSender());
  assert.deepEqual(Object.keys(reply).sort(), ['code', 'message', 'ok']);
  assert.equal(reply.code, 'no_plan_scope');
  assert.match(reply.message, /uso do plano ChatGPT não foi autorizado/);

  const blocked = await setup({ fixtureOptions: { exchangeError: 'subscription_sharing_user_not_eligible' } });
  const pending = blocked.siwc.login();
  await until(() => blocked.opened.length === 1);
  blocked.siwc.onBeforeNavigate({
    frameId: 0,
    tabId: blocked.opened[0].id,
    url: blocked.fixture.begin(blocked.opened[0].url),
  });
  const result = await pending;
  assert.equal(result.ok, false);
  assert.equal(result.code, 'not_eligible');
  assert.match(result.message, /Não há correção no código do Lume/);
  assert.equal(blocked.session.data.has(SESSION_KEY), false);
});

test('logout revokes, reports an unconfirmed revocation, and keeps the host id', async () => {
  const ctx = await setup();
  const first = await signIn(ctx);
  const hostId = ctx.local.data.get(LOCAL_KEYS.hostId);
  assert.match(hostId, /^urn:uuid:/);
  assert.equal(first.status.email, 'synthetic@example.com');
  const revoked = await ctx.siwc.logout();
  assert.equal(revoked.remoteRevocationConfirmed, true);
  assert.equal(ctx.fixture.counts.revoke, 1);
  assert.equal(ctx.session.data.has(SESSION_KEY), false);
  assert.equal(ctx.local.data.get(LOCAL_KEYS.hostId), hostId);
  assert.equal(ctx.local.data.get(LOCAL_KEYS.clientId), ctx.fixture.issuedClientId);

  const again = ctx.siwc.login();
  await until(() => ctx.opened.length === 1);
  const authorize = new URL(ctx.opened[0].url);
  assert.equal(authorize.searchParams.get('client_id'), ctx.fixture.issuedClientId);
  assert.equal(authorize.searchParams.get('ext_agent_host_id'), hostId);
  assert.equal(authorize.searchParams.has('agent_name_hint'), false);
  ctx.siwc.onBeforeNavigate({ frameId: 0, tabId: ctx.opened[0].id, url: ctx.fixture.begin(ctx.opened[0].url) });
  assert.equal((await again).planEnabled, true);

  const flaky = await setup();
  await signIn(flaky);
  flaky.setFetch(async (url, opts = {}) => {
    if (String(url).includes('/oauth/revoke')) return new Response('nope', { status: 503 });
    return flaky.fixture.handle({ url: String(url), method: opts.method ?? 'GET', body: opts.body?.toString?.() ?? '' });
  });
  const out = await flaky.siwc.logout();
  assert.equal(out.remoteRevocationConfirmed, false);
  assert.match(out.message, /revogação remota não foi confirmada/);
  assert.equal(flaky.fixture.counts.revoke, 0);
  assert.equal(flaky.session.data.has(SESSION_KEY), false);
  assert.equal(flaky.local.data.get(LOCAL_KEYS.email), 'synthetic@example.com');
});

test('grep: no token-like value is written to storage.local or console', async () => {
  const sources = ['siwc-auth.js', 'siwc-session.js', 'worker.js', 'panel.js'].map((name) => readFileSync(new URL(`../src/${name}`, import.meta.url), 'utf8'));
  for (const text of sources) {
    assert.doesNotMatch(text, /console\.(log|debug|info|warn|error|trace)\(/);
    assert.doesNotMatch(text, /storage\.local[\s\S]{0,80}(access_token|refresh_token|id_token|accessToken|refreshToken)/);
  }
  const ctx = await setup();
  const logs = [];
  const methods = ['log', 'info', 'debug', 'warn', 'error'];
  const previous = new Map(methods.map((method) => [method, console[method]]));
  for (const method of methods) console[method] = (...args) => logs.push(args.map(String).join(' '));
  try {
    await ctx.siwc.writeLocal({
      hostId: HOST,
      clientId: 'oaiapp_synthetic',
      email: 'synthetic@example.com',
      accessToken: 'synthetic-access-token-leak',
      refreshToken: 'synthetic-refresh-token-leak',
      idToken: 'eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiJ4In0.sig',
    });
    await signIn(ctx);
    await ctx.siwc.access(panelSender());
    await ctx.siwc.logout();
  } finally {
    for (const [method, fn] of previous) console[method] = fn;
  }
  const localBlob = JSON.stringify(Object.fromEntries(ctx.local.data));
  const consoleBlob = logs.join('\n');
  const stored = [...ctx.session.data.values()];
  assert.equal(stored.length, 0);
  for (const secret of ['synthetic-access-token', 'synthetic-refresh-token', 'eyJhbGci', 'synthetic-code-']) {
    assert.equal(localBlob.includes(secret), false, secret);
    assert.equal(consoleBlob.includes(secret), false, secret);
  }
  assert.equal(consoleBlob.includes('eyJ'), false);
});

test('the callback handler is also bound where Chrome reports a refused redirect', () => {
  const bound = [];
  const sessionArea = area();
  sessionArea.setAccessLevel = async () => {};
  installSiwc({
    storage: { local: area(), session: sessionArea },
    runtime: { id: EXT, onMessage: { addListener() {} } },
    tabs: { async create() { return { id: 1 }; }, async remove() {} },
    webNavigation: {
      onBeforeNavigate: { addListener(fn) { bound.push(['before', fn]); } },
      onCommitted: { addListener(fn) { bound.push(['commit', fn]); } },
      onErrorOccurred: { addListener(fn) { bound.push(['error', fn]); } },
    },
  });
  assert.deepEqual(bound.map(([name]) => name), ['before', 'commit', 'error']);
  assert.equal(new Set(bound.map(([, fn]) => fn)).size, 1);
});

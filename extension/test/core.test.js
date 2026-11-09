import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTracker, readCase, STATES, summarize } from '../src/core.js';
import { doc, el } from './dom.js';
import { loginPage, ORIGIN, page1, page2, PAGE1, PAGE2, row, transport, unknownLayout } from './fixtures.js';

const ALL_IDS = ['D1', 'D1A', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
const read = (t, extra = {}) => readCase({ startDoc: page1(), startUrl: PAGE1, fetchPage: t.fetchPage, ...extra });
const byId = (inv) => Object.fromEntries(inv.items.map((i) => [i.id, i]));

test('inventory: every row across both list pages appears exactly once with an explicit state', async () => {
  const inv = await read(transport());
  assert.equal(inv.status, 'complete');
  assert.equal(inv.caseNumber, 'TEST-CASE-A');
  assert.deepEqual(inv.items.map((i) => i.id), ALL_IDS);
  assert.deepEqual(inv.segments.map((s) => [s.n, s.status, s.rows]), [[1, 'read', 3], [2, 'read', 5]]);
  const s = byId(inv);
  assert.deepEqual(
    Object.fromEntries(ALL_IDS.map((id) => [id, s[id].state])),
    { D1: 'processed', D1A: 'processed', D2: 'processed', D3: 'processed', D4: 'unsupported', D5: 'missing', D6: 'failed', D7: 'missing' },
  );
  assert.equal(s.D1A.kind, 'attachment');
  assert.equal(s.D1A.parentId, 'D1');
  assert.equal(s.D1.expectedPages, 3);
  assert.equal(s.D4.expectedPages, null);
  assert.equal(s.D1.version, '1');
  for (const i of inv.items) assert.ok(STATES.includes(i.state), `${i.id} has a known state`);
  const c = summarize(inv);
  assert.equal(c.identified, 8);
  assert.equal(STATES.reduce((n, k) => n + c[k], 0), c.identified, 'states add up to identified');
  assert.equal(c.pending, 0);
});

test('inventory: a sigilo-marked row is fetched like any other', async () => {
  const t = transport();
  await read(t);
  assert.ok(t.calls.some((u) => u.includes('id=D2')));
});

test('inventory: http 403 on a document becomes restricted, not failed or dropped', async () => {
  const inv = await read(transport({ [`${ORIGIN}/pje/doc?id=D1`]: () => ({ status: 403 }) }));
  assert.equal(byId(inv).D1.state, 'restricted');
  assert.equal(inv.items.length, 8);
});

test('inventory: a network error on one document marks it failed and reading continues', async () => {
  const inv = await read(transport({ [`${ORIGIN}/pje/doc?id=D1`]: () => { throw new Error('offline'); } }));
  assert.equal(byId(inv).D1.state, 'failed');
  assert.equal(byId(inv).D3.state, 'processed');
});

test('inventory: an unreachable list page is recorded as a failed segment and the result is incomplete', async () => {
  const inv = await read(transport({ [PAGE2]: () => ({ status: 503 }) }));
  assert.equal(inv.status, 'incomplete');
  assert.deepEqual(inv.segments.map((s) => s.status), ['read', 'failed']);
  assert.equal(inv.items.length, 3);
});

test('inventory: a list that ends early is marked with unread segments', async () => {
  const short = () => page1({ next: null, total: 3 });
  const inv = await readCase({ startDoc: short(), startUrl: PAGE1, fetchPage: transport({ [PAGE1]: () => ({ status: 200, contentType: 'text/html', doc: short() }) }).fetchPage });
  assert.equal(inv.status, 'incomplete');
  assert.deepEqual(inv.segments.map((s) => s.status), ['read', 'unread', 'unread']);
});

test('inventory: reading from list page 2 starts at the first page link', async () => {
  const t = transport();
  const inv = await readCase({ startDoc: page2({ first: '/pje/autos?p=1' }), startUrl: PAGE2, fetchPage: t.fetchPage });
  assert.equal(inv.status, 'complete');
  assert.deepEqual(inv.items.map((i) => i.id), ALL_IDS);
  assert.equal(t.calls[0], PAGE1);
});

test('inventory: a cross-origin document link is refused without a request', async () => {
  const start = page1({ rows: [row('X1', {}, 'https://elsewhere.example/doc')], next: null, total: 1 });
  const t = transport({ [PAGE1]: () => ({ status: 200, contentType: 'text/html', doc: start }) });
  const inv = await readCase({ startDoc: start, startUrl: PAGE1, fetchPage: t.fetchPage });
  assert.equal(inv.status, 'stopped');
  assert.equal(inv.stopReason, 'incompatible_layout');
  assert.ok(!t.calls.some((u) => u.includes('elsewhere')));
});

test('case switch: a list page from another case invalidates the run', async () => {
  const inv = await read(transport({ [PAGE2]: () => ({ status: 200, contentType: 'text/html', doc: page2({ caseNumber: 'TEST-CASE-B' }) }) }));
  assert.equal(inv.status, 'stopped');
  assert.equal(inv.stopReason, 'invalidated');
  assert.ok(inv.items.every((i) => !['D3', 'D4', 'D5', 'D6', 'D7'].includes(i.id)), 'no item of the other case is kept');
});

test('case switch: isCurrent() turning false mid-read stops before the next request', async () => {
  let current = true;
  const t = transport({ [`${ORIGIN}/pje/doc?id=D1`]: () => { current = false; return { status: 200, contentType: 'application/pdf' }; } });
  const inv = await read(t, { isCurrent: () => current });
  assert.equal(inv.stopReason, 'invalidated');
  assert.equal(t.calls.at(-1), `${ORIGIN}/pje/doc?id=D1`, 'no request after the switch');
  assert.notEqual(byId(inv).D1.state, 'processed', 'the response that arrived after the switch is not used');
});

test('case switch: the tracker drops the old inventory and never publishes stale progress', async () => {
  let page = page1();
  const published = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const t = transport({ [`${ORIGIN}/pje/doc?id=D1`]: async () => { await gate; return { status: 200, contentType: 'application/pdf' }; } });
  const tracker = createTracker({ getDoc: () => page, getUrl: () => PAGE1, fetchPage: t.fetchPage, publish: (s) => published.push(s) });
  const run = tracker.start();
  await new Promise((r) => setImmediate(r));
  assert.equal(tracker.status().inventory.caseNumber, 'TEST-CASE-A');

  page = page1({ caseNumber: 'TEST-CASE-B' }); // the user opens another case in the same tab
  assert.equal(tracker.refresh(), true);
  const after = published.length;
  assert.equal(tracker.status().view.caseNumber, 'TEST-CASE-B');
  assert.equal(tracker.status().inventory, null);
  release();
  await run;
  assert.equal(published.length, after, 'nothing from case A is published after the switch');
  assert.equal(tracker.status().inventory, null);

  page = page1({ caseNumber: 'TEST-CASE-B' });
  const t2 = transport({ [PAGE1]: () => ({ status: 200, contentType: 'text/html', doc: page1({ caseNumber: 'TEST-CASE-B' }) }), [PAGE2]: () => ({ status: 200, contentType: 'text/html', doc: page2({ caseNumber: 'TEST-CASE-B' }) }) });
  const tracker2 = createTracker({ getDoc: () => page, getUrl: () => PAGE1, fetchPage: t2.fetchPage, publish: () => {} });
  const inv = await tracker2.start();
  assert.equal(inv.caseNumber, 'TEST-CASE-B');
  assert.equal(inv.status, 'complete');
});

test('navigation: a change of the visible list page in the same case invalidates in-flight work', async () => {
  let page = page1();
  let url = PAGE1;
  const t = transport({ [`${ORIGIN}/pje/doc?id=D1`]: () => { page = page2(); url = PAGE2; return { status: 200, contentType: 'application/pdf' }; } });
  const tracker = createTracker({ getDoc: () => page, getUrl: () => url, fetchPage: t.fetchPage, publish: () => {} });
  const inv = await tracker.start();
  assert.equal(inv.stopReason, 'invalidated');
  assert.equal(tracker.status().inventory, null);
  assert.equal(tracker.status().epoch, 1);
});

test('mutation: a list that changes between start and end of reading is reported', async () => {
  let n = 0;
  const inv = await read(transport({
    [PAGE1]: () => ({ status: 200, contentType: 'text/html', doc: page1({ rows: [row('D1'), row('D1A'), row('D2', { 'data-sigilo': '' }, null), row('D8')] }) }),
    [PAGE2]: () => (n++, { status: 200, contentType: 'text/html', doc: page2() }),
  }));
  assert.equal(inv.status, 'stopped');
  assert.equal(inv.stopReason, 'inventory_changed');
  assert.equal(n, 1);
});

test('mutation: a new version of a listed document is reported', async () => {
  const inv = await read(transport({ [PAGE1]: () => ({ status: 200, contentType: 'text/html', doc: page1({ rows: [row('D1', { 'data-versao': '2' }), row('D1A', { 'data-tipo': 'anexo', 'data-pai': 'D1' }), row('D2', { 'data-sigilo': '' }, null)] }) }) }));
  assert.equal(inv.stopReason, 'inventory_changed');
});

test('mutation: rows shifting across pages (a duplicate) or a changed page count stop the read', async () => {
  const dup = await read(transport({ [PAGE2]: () => ({ status: 200, contentType: 'text/html', doc: page2({ rows: [row('D1'), row('D3')] }) }) }));
  assert.equal(dup.stopReason, 'inventory_changed');
  const total = await read(transport({ [PAGE2]: () => ({ status: 200, contentType: 'text/html', doc: page2({ total: 3 }) }) }));
  assert.equal(total.stopReason, 'inventory_changed');
});

test('safe stop: an expired-session page in pagination stops with no further requests', async () => {
  const t = transport({ [PAGE2]: () => ({ status: 200, contentType: 'text/html', doc: loginPage() }) });
  const inv = await read(t);
  assert.equal(inv.status, 'stopped');
  assert.equal(inv.stopReason, 'session_expired');
  assert.deepEqual(t.calls, [PAGE2]);
  assert.equal(summarize(inv).pending, 3, 'unfetched items stay pending, not dropped');
});

test('safe stop: a 401 or a login page instead of a document stops the read', async () => {
  for (const res of [{ status: 401 }, { status: 200, contentType: 'text/html', doc: loginPage() }]) {
    const t = transport({ [`${ORIGIN}/pje/doc?id=D1`]: () => res });
    const inv = await read(t);
    assert.equal(inv.stopReason, 'session_expired');
    assert.equal(t.calls.at(-1), `${ORIGIN}/pje/doc?id=D1`);
  }
});

test('safe stop: an unknown layout stops before any request', async () => {
  for (const startDoc of [unknownLayout(), loginPage()]) {
    const t = transport();
    const inv = await readCase({ startDoc, startUrl: PAGE1, fetchPage: t.fetchPage });
    assert.equal(inv.status, 'stopped');
    assert.ok(['incompatible_layout', 'session_expired'].includes(inv.stopReason));
    assert.deepEqual(t.calls, []);
  }
});

test('safe stop: a row without an id stops instead of silently dropping it', async () => {
  const start = page1({ rows: [row('D1'), el('tr', { class: 'documento' }, 'sem id')] });
  const t = transport();
  const inv = await readCase({ startDoc: start, startUrl: PAGE1, fetchPage: t.fetchPage });
  assert.equal(inv.stopReason, 'incompatible_layout');
  assert.deepEqual(t.calls, []);
});

test('safe stop: a pagination loop stops', async () => {
  const inv = await read(transport({ [PAGE2]: () => ({ status: 200, contentType: 'text/html', doc: page2({ next: '/pje/autos?p=1' }) }) }));
  assert.equal(inv.stopReason, 'incompatible_layout');
});

test('safe stop: the user can stop a read; the tracker reports it and reads nothing else', async () => {
  const t = transport();
  let tracker;
  const t2 = { fetchPage: async (u, s) => { if (u.includes('D1')) tracker.stop(); return t.fetchPage(u, s); } };
  tracker = createTracker({ getDoc: page1, getUrl: () => PAGE1, fetchPage: t2.fetchPage, publish: () => {} });
  const inv = await tracker.start();
  assert.equal(inv.stopReason, 'stopped_by_user');
  assert.equal(t.calls.at(-1), `${ORIGIN}/pje/doc?id=D1`);
  assert.equal(tracker.status().inventory.stopReason, 'stopped_by_user');
});

test('tracker: an expired-session or unknown page is published without starting a read', async () => {
  for (const [page, status] of [[loginPage(), 'session_expired'], [unknownLayout(), 'incompatible_layout'], [doc(), 'incompatible_layout']]) {
    const t = transport();
    const tracker = createTracker({ getDoc: () => page, getUrl: () => PAGE1, fetchPage: t.fetchPage, publish: () => {} });
    assert.equal(tracker.status().view.status, status);
    assert.equal(await tracker.start(), null);
    assert.deepEqual(t.calls, []);
  }
});

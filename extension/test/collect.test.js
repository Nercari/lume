import { test } from 'node:test';
import assert from 'node:assert/strict';
import { collectCase, DOCUMENT_FETCH_LIMIT } from '../src/collect.js';
import { PROFILES } from '../src/profile.js';
import { URL_RULE_IDS } from '../src/url-rules.js';
import { doc, el } from './dom.js';
import { ORIGIN, listPage, page1, page2, row, PAGE1, PAGE2 } from './fixtures.js';

function bytesOf(text) {
  return new TextEncoder().encode(text);
}

function transport(overrides = {}) {
  const calls = [];
  const routes = {
    [PAGE2]: () => ({ status: 200, contentType: 'text/html', doc: page2(), bytes: bytesOf('list') }),
    [`${ORIGIN}/pje/doc?id=D1`]: () => ({ status: 200, contentType: 'application/pdf', bytes: bytesOf('pdf-d1') }),
    [`${ORIGIN}/pje/doc?id=D1A`]: () => ({ status: 200, contentType: 'application/pdf', bytes: bytesOf('pdf-d1a') }),
    [`${ORIGIN}/pje/doc?id=D2`]: () => ({ status: 200, contentType: 'application/pdf', bytes: bytesOf('pdf-d2') }),
    [`${ORIGIN}/pje/doc?id=D3`]: () => ({ status: 200, contentType: 'text/html', bytes: bytesOf('<p>TOKENHTML</p>') }),
    [`${ORIGIN}/pje/doc?id=D4`]: () => ({ status: 200, contentType: 'video/mp4', bytes: bytesOf('video') }),
    [`${ORIGIN}/pje/doc?id=D5`]: () => ({ status: 404, contentType: 'text/plain', bytes: new Uint8Array() }),
    [`${ORIGIN}/pje/doc?id=D6`]: () => ({ status: 500, contentType: 'text/plain', bytes: bytesOf('no') }),
    ...overrides,
  };
  return {
    calls,
    async fetchBytes(url) {
      calls.push(url);
      const route = routes[url];
      if (!route) throw new Error(`unexpected ${url}`);
      return route();
    },
  };
}

const ids = (result) => result.items.map((item) => item.id);

test('collection keeps every row and names what it could not read', async () => {
  const t = transport();
  const seen = [];
  const result = await collectCase({
    startDoc: page1(),
    startUrl: PAGE1,
    fetchBytes: t.fetchBytes,
    pauseMs: 0,
    onDocument: async (doc) => seen.push(doc.id),
  });
  assert.equal(result.status, 'complete');
  assert.deepEqual(ids(result), ['D1', 'D1A', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7']);
  assert.deepEqual(seen, ['D1', 'D1A', 'D2', 'D3']);
  const byId = Object.fromEntries(result.items.map((item) => [item.id, item.state]));
  assert.equal(byId.D1, 'processed');
  assert.equal(byId.D2, 'processed');
  assert.equal(byId.D4, 'unsupported');
  assert.equal(byId.D5, 'missing');
  assert.equal(byId.D6, 'failed');
  assert.equal(byId.D7, 'missing');
  for (const id of ['D4', 'D5', 'D6', 'D7']) {
    assert.ok(result.misses.some((miss) => miss.id === id), id);
  }
  assert.ok(t.calls.includes(`${ORIGIN}/pje/doc?id=D2`));
});

test('a link that matches no URL rule is listed and not fetched', async () => {
  const start = page1({
    rows: [el('tr', { class: 'documento', 'data-id': 'DX', 'data-versao': '1' }, el('a', { class: 'abrir', href: '/pje/static/logo.png' }, 'abrir'))],
    next: null,
    total: 1,
  });
  const t = transport({ [PAGE1]: () => ({ status: 200, contentType: 'text/html', doc: start, bytes: new Uint8Array() }) });
  const result = await collectCase({ startDoc: start, startUrl: PAGE1, fetchBytes: t.fetchBytes, pauseMs: 0 });
  assert.equal(result.items[0].state, 'failed');
  assert.match(result.items[0].detail, /nenhuma regra de URL/);
  for (const id of URL_RULE_IDS) assert.match(result.items[0].detail, new RegExp(id));
  assert.equal(result.misses[0].id, 'DX');
  assert.ok(!t.calls.some((url) => url.includes('logo')));
});

function autosPage() {
  return doc(
    el('div', { id: 'autosDigitais' },
      el('span', { class: 'numero-processo' }, 'TEST-CASE-A'),
      el('a', { href: '/pje/downloadAutos.seam' }, 'baixar'),
      el('table', { id: 'listaDocumentos' },
        el('tr', { class: 'documento', 'data-id': 'D1', 'data-versao': '1' }, el('a', { class: 'abrir', href: '/pje/doc?id=D1' }, 'abrir'))),
      el('span', { class: 'paginacao' }, 'Página 1 de 1')),
  );
}

function profilesOptingIntoAutos() {
  return PROFILES.map((profile) => (profile.id === 'trf1-placeholder-unverified' ? { ...profile, useDownloadAutos: true } : profile));
}

test('each document PDF is fetched even when a full-autos link is on the page', async () => {
  const start = autosPage();
  const t = transport({
    [`${ORIGIN}/pje/downloadAutos.seam`]: () => ({ status: 200, contentType: 'application/pdf', bytes: bytesOf('AUTOS') }),
  });
  const seen = [];
  const result = await collectCase({
    startDoc: start,
    startUrl: PAGE1,
    fetchBytes: t.fetchBytes,
    pauseMs: 0,
    onDocument: async (doc) => seen.push([doc.id, doc.source, new TextDecoder().decode(doc.bytes)]),
  });
  assert.equal(result.mode, 'documents');
  assert.deepEqual(seen, [['D1', 'document', 'pdf-d1']]);
  assert.equal(result.items[0].state, 'processed');
  assert.ok(!t.calls.some((url) => url.includes('downloadAutos')));
});

test('a profile can opt into the full-autos PDF instead of each document', async () => {
  const start = autosPage();
  const t = transport({
    [`${ORIGIN}/pje/downloadAutos.seam`]: () => ({ status: 200, contentType: 'application/pdf', bytes: bytesOf('AUTOS') }),
  });
  const seen = [];
  const result = await collectCase({
    startDoc: start,
    startUrl: PAGE1,
    fetchBytes: t.fetchBytes,
    pauseMs: 0,
    profile: profilesOptingIntoAutos(),
    onDocument: async (doc) => seen.push([doc.id, doc.source, new TextDecoder().decode(doc.bytes)]),
  });
  assert.equal(result.mode, 'autos');
  assert.deepEqual(seen, [['autos', 'download-autos', 'AUTOS']]);
  assert.equal(result.items[0].state, 'processed');
  assert.ok(!t.calls.some((url) => url.includes('/pje/doc')));
});

test('an autos control whose URL matches no autos rule is reported and documents are still fetched', async () => {
  const start = doc(
    el('div', { id: 'autosDigitais' },
      el('span', { class: 'numero-processo' }, 'TEST-CASE-A'),
      el('a', { id: 'linkDownloadAutos', href: '/pje/static/not-autos' }, 'baixar'),
      el('table', { id: 'listaDocumentos' },
        el('tr', { class: 'documento', 'data-id': 'D1', 'data-versao': '1' }, el('a', { class: 'abrir', href: '/pje/doc?id=D1' }, 'abrir'))),
      el('span', { class: 'paginacao' }, 'Página 1 de 1')),
  );
  const t = transport();
  const result = await collectCase({
    startDoc: start,
    startUrl: PAGE1,
    fetchBytes: t.fetchBytes,
    pauseMs: 0,
    profile: profilesOptingIntoAutos(),
  });
  assert.equal(result.mode, 'documents');
  assert.ok(result.misses.some((miss) => miss.reason === 'autos'));
  assert.equal(result.items[0].state, 'processed');
  assert.ok(t.calls.includes(`${ORIGIN}/pje/doc?id=D1`));
});

test('a wave fetches up to four documents at once and the pause separates waves', async () => {
  const rows = ['D1', 'D2', 'D3', 'D4', 'D5'].map((id) => row(id));
  const start = listPage({ current: 1, total: 1, rows });
  const times = [];
  const result = await collectCase({
    startDoc: start,
    startUrl: PAGE1,
    fetchBytes: async () => {
      times.push(Date.now());
      return { status: 200, contentType: 'application/pdf', bytes: bytesOf('pdf') };
    },
  });
  assert.equal(result.status, 'complete');
  assert.equal(times.length, 5);
  assert.ok(times[3] - times[0] < 100, `first wave starts together: ${times[3] - times[0]}`);
  assert.ok(times[4] - times[3] >= 250, `the pause stays between waves: ${times[4] - times[3]}`);
});

test('a wave keeps the cap at four fetches in flight and the list order', async () => {
  const rows = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'].map((id) => row(id));
  const start = listPage({ current: 1, total: 1, rows });
  let inFlight = 0;
  let peak = 0;
  const seen = [];
  const result = await collectCase({
    startDoc: start,
    startUrl: PAGE1,
    pauseMs: 0,
    fetchBytes: async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 20));
      inFlight -= 1;
      return { status: 200, contentType: 'application/pdf', bytes: bytesOf('pdf') };
    },
    onDocument: async (doc) => seen.push(doc.id),
  });
  assert.equal(result.status, 'complete');
  assert.equal(peak, DOCUMENT_FETCH_LIMIT);
  assert.deepEqual(seen, ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9']);
  assert.deepEqual(ids(result), seen);
});

test('one failed fetch in a wave stays on its own document', async () => {
  const rows = [row('D1'), row('D2'), row('D3')];
  const start = listPage({ current: 1, total: 1, rows });
  const seen = [];
  const result = await collectCase({
    startDoc: start,
    startUrl: PAGE1,
    pauseMs: 0,
    fetchBytes: async (url) => {
      if (url.includes('D2')) throw new Error('socket closed');
      return { status: 200, contentType: 'application/pdf', bytes: bytesOf('pdf') };
    },
    onDocument: async (doc) => seen.push(doc.id),
  });
  assert.equal(result.status, 'complete');
  assert.deepEqual(seen, ['D1', 'D3']);
  const byId = Object.fromEntries(result.items.map((item) => [item.id, item.state]));
  assert.equal(byId.D1, 'processed');
  assert.equal(byId.D2, 'failed');
  assert.equal(byId.D3, 'processed');
  assert.ok(result.misses.some((miss) => miss.id === 'D2' && miss.reason === 'network'));
});

test('an abort in the first wave starts no further wave', async () => {
  const rows = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8'].map((id) => row(id));
  const start = listPage({ current: 1, total: 1, rows });
  const ctrl = new AbortController();
  let calls = 0;
  const result = await collectCase({
    startDoc: start,
    startUrl: PAGE1,
    pauseMs: 0,
    signal: ctrl.signal,
    fetchBytes: async () => {
      calls += 1;
      if (calls === 2) ctrl.abort('user');
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { status: 200, contentType: 'application/pdf', bytes: bytesOf('pdf') };
    },
  });
  assert.equal(result.status, 'stopped');
  assert.equal(result.stopReason, 'stopped_by_user');
  assert.ok(calls <= DOCUMENT_FETCH_LIMIT, `no second wave: ${calls} fetches`);
});

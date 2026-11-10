import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { collectCase } from '../src/collect.js';
import { readCase } from '../src/core.js';
import { SIGILO_TEXT, caseHasSigilo, presentSigilo } from '../src/run.js';
import { ORIGIN, PAGE1, page1, transport } from './fixtures.js';

function bytesOf(text) {
  return new TextEncoder().encode(text);
}

test('data-sigilo is a flag and the row is still fetched', async () => {
  const t = transport();
  const inv = await readCase({ startDoc: page1(), startUrl: PAGE1, fetchPage: t.fetchPage });
  const byId = Object.fromEntries(inv.items.map((item) => [item.id, item]));
  assert.equal(byId.D2.sigilo, true);
  assert.equal(byId.D1.sigilo, false);
  assert.equal(byId.D2.state, 'processed');
  assert.ok(t.calls.some((url) => url.includes('id=D2')));
  assert.equal(caseHasSigilo(inv.items), true);
});

test('collection keeps the sigilo flag and does not skip the document', async () => {
  const calls = [];
  const routes = {
    [`${ORIGIN}/pje/autos?p=2`]: () => ({ status: 200, contentType: 'text/html', doc: page1({ next: null, total: 1, rows: undefined }), bytes: bytesOf('list') }),
  };
  const result = await collectCase({
    startDoc: page1({ next: null, total: 1 }),
    startUrl: PAGE1,
    pauseMs: 0,
    fetchBytes: async (url) => {
      calls.push(url);
      if (url.endsWith('id=D1')) return { status: 200, contentType: 'application/pdf', bytes: bytesOf('a') };
      if (url.endsWith('id=D1A')) return { status: 200, contentType: 'application/pdf', bytes: bytesOf('b') };
      if (url.endsWith('id=D2')) return { status: 200, contentType: 'application/pdf', bytes: bytesOf('c') };
      const route = routes[url];
      if (route) return route();
      throw new Error(`unexpected ${url}`);
    },
  });
  const byId = Object.fromEntries(result.items.map((item) => [item.id, item]));
  assert.equal(result.sigilo, true);
  assert.equal(byId.D2.sigilo, true);
  assert.equal(byId.D2.state, 'processed');
  assert.equal(byId.D1.sigilo, false);
  assert.ok(calls.some((url) => url.includes('id=D2')));
});

test('the sigilo warning is one line and does not block gerar', () => {
  assert.equal(SIGILO_TEXT.includes('\n'), false);
  const warning = { hidden: true, textContent: '' };
  const generate = { disabled: false, textContent: 'Gerar relatório e minuta' };
  presentSigilo(warning, true);
  assert.equal(warning.hidden, false);
  assert.equal(warning.textContent, SIGILO_TEXT);
  assert.equal(generate.disabled, false);
  const html = readFileSync(new URL('../src/study.html', import.meta.url), 'utf8');
  assert.match(html, /<p id="sigilo"/);
  assert.match(html, /<button id="gerar" type="button">Gerar relatório e minuta<\/button>/);
  assert.equal(/<button id="gerar"[^>]*disabled/.test(html), false);
  const study = readFileSync(new URL('../src/study.js', import.meta.url), 'utf8');
  assert.match(study, /presentSigilo\(\$\('sigilo'\), flagged\)/);
  const content = readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
  assert.match(content, /sigilo: item\.sigilo === true/);
});

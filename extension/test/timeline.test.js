import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseListPage } from '../src/core.js';
import { collectCase } from '../src/collect.js';
import { dateToken, idFromOnclick } from '../src/timeline.js';
import { doc, el } from './dom.js';
import { ORIGIN, PAGE1 } from './fixtures.js';

const PAGE = `https://pje2g.trf1.jus.br/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=1&ca=token`;

function timelinePage() {
  return doc(
    el('span', { class: 'numero-processo' }, 'TEST-CASE-A'),
    el('span', { id: 'viewerCount' }, '44 de 51'),
    el('div', { id: 'divTimeLine' },
      el('div', { class: 'media' },
        el('a', { onclick: "mostrarDocumento('DOC2')" }, 'ver'),
        el('span', { class: 'data' }, '02/02/2020')),
      el('div', { class: 'media' },
        el('a', { href: '/pje/documento/download/DOC1' }, 'ver'),
        el('span', { class: 'data' }, 'nao-e-data 01/01/2020'))),
  );
}

test('onclick ids and exact dates are read, and the viewer counter is not a page list', () => {
  assert.equal(idFromOnclick("return mostrarDocumento('DOC9');"), 'DOC9');
  assert.equal(idFromOnclick('mostrarDocumento(42)'), '42');
  assert.equal(idFromOnclick('if (ready) return false;'), null);
  assert.equal(dateToken('02/02/2020'), '02/02/2020');
  assert.equal(dateToken('Processo 02/02/2020'), null);
  const page = parseListPage(timelinePage(), PAGE);
  assert.equal(page.bound.id, 'trf1-list-autos-digitais-unverified');
  assert.equal(page.pageInfo, null);
  assert.deepEqual(page.items.map((item) => item.id), ['DOC2', 'DOC1']);
  assert.equal(page.items[0].date, '02/02/2020');
  assert.equal(page.items[1].date, null);
  assert.match(page.items[0].href, /\/documento\/download\/DOC2$/);
  assert.match(page.items[1].href, /\/documento\/download\/DOC1$/);
});

test('timeline collection keeps entry order and fetches each document URL', async () => {
  const start = timelinePage();
  const calls = [];
  const result = await collectCase({
    startDoc: start,
    startUrl: PAGE,
    fetchBytes: async (url) => {
      calls.push(url);
      const id = url.endsWith('DOC2') ? 'DOC2' : 'DOC1';
      return { status: 200, contentType: 'application/pdf', bytes: new TextEncoder().encode(id) };
    },
    onDocument: async () => {},
    pauseMs: 0,
  });
  assert.deepEqual(result.items.map((item) => item.id), ['DOC2', 'DOC1']);
  assert.deepEqual(calls, [
    `${ORIGIN.replace('pje1g', 'pje2g')}/pje/documento/download/DOC2`,
    `${ORIGIN.replace('pje1g', 'pje2g')}/pje/documento/download/DOC1`,
  ]);
  assert.equal(result.mode, 'documents');
  assert.ok(!calls.some((url) => url.includes('listAutosDigitais')));
  assert.equal(PAGE1.includes('listAutosDigitais'), false);
});

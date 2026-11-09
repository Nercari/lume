import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCalibration, CALIBRATION_DOWNLOAD_NAME } from '../src/calibrate.js';
import { doc, el } from './dom.js';

const NAME = 'Nome Ficticio Teste';
const CPF = '000.000.000-00';
const CPF_DIGITS = '00000000000';
const CNPJ = '00.000.000/0000-00';
const CNJ = '0000000-00.0000.0.00.0000';
const DATE = '01/01/2000';
const ISO = '2000-01-01';
const SECRETS = [NAME, CPF, CPF_DIGITS, CNPJ, CNJ, DATE, ISO, '99887766', '54321', 'Nome%20Ficticio'];

function stringsOf(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => stringsOf(item, out));
  else if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) {
      out.push(key);
      stringsOf(item, out);
    }
  }
  return out;
}

function secretPage() {
  const inner = doc(el('span', { id: 'parte-frame' }, NAME));
  const frame = el('iframe', { id: 'caso', src: `https://pje1g.trf1.jus.br/pje/quadro?cpf=${CPF}&nome=${encodeURIComponent(NAME)}` });
  frame.contentDocument = inner;
  return doc(
    el('meta', { name: 'generator', content: `PJe 2.4.1 ${NAME} ${CNJ}` }),
    el('h1', { title: NAME }, NAME),
    el('input', { type: 'text', value: CPF, 'aria-label': NAME }),
    el('div', { id: 'docs:456789:link', class: 'rich-tree', 'data-nome': NAME, 'data-cpf': CPF }, `${CNJ} ${CNPJ} ${DATE}`),
    el('table', { id: 'lista' },
      el('tr', { class: 'documento' }, el('td', {}, NAME)),
      el('tr', {}, el('td', {}, `${CPF} ${ISO}`)),
    ),
    el('a', {
      id: 'abrir-99887766',
      href: `https://pje1g.trf1.jus.br/pje/documento/download/99887766?cpf=${CPF}&titulo=${encodeURIComponent(NAME)}`,
      onclick: `mostrarDocumento('99887766')`,
    }, NAME),
    el('span', { id: 'contadorDocs' }, '44 de 51'),
    el('span', { id: 'contadorPags' }, '3 of 7'),
    el('iframe', { id: 'pdfViewer', src: 'https://pje2g.trf1.jus.br/pje/pdfjs/web/viewer.html?file=/pje/documento/download/99887766' }),
    el('form', { action: `https://pje1g.trf1.jus.br/pje/downloadAutos.seam?numero=${CNJ}&nome=${encodeURIComponent(NAME)}` }),
    frame,
  );
}

test('calibration JSON from a page full of fake identifiers contains none of them', () => {
  const page = secretPage();
  const link = page.querySelector('a');
  const snap = buildCalibration(page, {
    profiles: [{ id: 't', docList: ['#lista'], docRow: ['tr'], openLink: ['a'] }],
    clicks: [link],
    resources: [{
      name: `https://pje1g.trf1.jus.br/pje/documento/download/99887766?cpf=${CPF}&titulo=${encodeURIComponent(NAME)}`,
      initiatorType: 'xmlhttprequest',
      transferSize: 54321,
      contentType: 'application/pdf; charset=binary',
    }],
  });
  const json = JSON.stringify(snap);
  for (const secret of SECRETS) assert.equal(json.includes(secret), false, secret);
  for (const value of stringsOf(snap)) assert.equal(/\d{4,}/.test(value), false, value);
  assert.equal(snap.version, 2);
  assert.equal(CALIBRATION_DOWNLOAD_NAME, 'lume-calibracao.json');
  assert.ok(snap.versions.includes('2.4.1'));
  assert.ok(snap.urlPatterns.some((pattern) => pattern === '/pje/documento/download/N?cpf&titulo'));
  assert.ok(snap.urlPatterns.some((pattern) => pattern === '/pje/downloadAutos.seam?numero&nome'));
  assert.equal(snap.resources[0].sizeBucket, 'lt-100k');
  assert.equal(snap.resources[0].contentType, 'application/pdf');
  assert.equal(snap.resources[0].url.includes('99887766'), false);
  assert.equal(snap.candidateLists[0].found, true);
  assert.equal(snap.candidateLists[0].rows, 2);
  assert.equal(snap.clicks[0].hrefPattern, '/pje/documento/download/N?cpf&titulo');
  assert.ok(snap.onclickFns.includes('mostrarDocumento'));
  assert.ok(snap.counters.some((counter) => counter.pattern === 'N de N'));
  assert.ok(snap.counters.some((counter) => counter.pattern === 'N of N'));
  assert.equal(json.includes('44 de 51'), false);
  assert.equal(json.includes('3 of 7'), false);
  assert.ok(snap.viewer.some((node) => node.id === 'pdfViewer'));
  assert.equal(JSON.stringify(snap.viewer).includes('99887766'), false);
  assert.equal(JSON.stringify(snap.clicks).includes(NAME), false);
  assert.ok(snap.frameTree.iframes.length >= 1);
});

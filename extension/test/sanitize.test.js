import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrationFilename, calibrationReport, MAX_SNAPSHOT_NODES, snapshotDocument } from '../src/calibrate.js';
import { sanitizeHref, sanitizeId } from '../src/sanitize.js';
import { doc, el } from './dom.js';

const NAME = 'Nome Ficticio Teste';
const CPF = '000.000.000-00';
const CPF_DIGITS = '00000000000';
const CNPJ = '00.000.000/0000-00';
const CNJ = '0000000-00.0000.0.00.0000';
const DATE = '01/01/2000';
const ISO = '2000-01-01';
const SECRETS = [NAME, CPF, CPF_DIGITS, CNPJ, CNJ, DATE, ISO, 'j_id123', 'j_id9999', '456789', '20261', 'x20261', 'numero='];

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
  const inner = doc(el('span', { id: 'j_id9999', class: 'inner-frame' }, NAME));
  const frame = el('iframe', { id: 'j_id123', src: `https://pje1g.trf1.jus.br/pje/x?cpf=${CPF}` });
  frame.contentDocument = inner;
  const blocked = el('iframe', { src: `https://evil.example/${CNJ}`, title: NAME });
  Object.defineProperty(blocked, 'contentDocument', { get() { throw new Error('blocked'); } });
  return doc(
    el('h1', { title: NAME }, NAME),
    el('img', { alt: NAME }),
    el('input', { type: 'text', value: CPF, 'aria-label': NAME, title: DATE, placeholder: ISO }),
    el('div', { id: 'docs:456789:link', class: 'rich-tree x20261', 'data-nome': NAME, 'data-cpf': CPF, 'data-quando': ISO }, `${CNJ} ${CNPJ}`),
    el('table', { id: 'lista', role: 'grid' },
      el('tr', {}, el('td', {}, NAME)),
      el('tr', {}, el('td', {}, DATE)),
    ),
    el('a', { href: `https://pje1g.trf1.jus.br/pje/ConsultaDocumento/listView.seam?numero=${CNJ}&nome=Nome%20Ficticio%20Teste` }, 'abrir'),
    frame,
    blocked,
  );
}

test('ids and hrefs keep structure and drop queries and long digit runs', () => {
  assert.equal(sanitizeId('j_id123'), 'j_id#');
  assert.equal(sanitizeId('j_id12345'), 'j_id#');
  assert.equal(sanitizeId('docs:456789:link'), 'docs:#:link');
  assert.equal(sanitizeId('j_id12'), 'j_id12');
  assert.equal(
    sanitizeHref(`https://pje1g.trf1.jus.br/pje/ConsultaDocumento/listView.seam?numero=${CNJ}&cpf=${CPF}`),
    '/pje/ConsultaDocumento/listView.seam',
  );
  assert.equal(sanitizeHref('/pje/doc/123456'), '/pje/doc/#');
  assert.equal(sanitizeHref('javascript:alert(1)'), null);
});

test('a page full of fake identifiers yields a snapshot with none of them', () => {
  const snap = snapshotDocument(secretPage());
  const json = JSON.stringify(snap);
  for (const secret of SECRETS) assert.equal(json.includes(secret), false, secret);
  for (const value of stringsOf(snap)) assert.equal(/\d{4,}/.test(value), false, value);
  assert.equal(snap.truncated, false);
  assert.equal(snap.counts.tables, 1);
  assert.equal(snap.counts.rows, 2);
  assert.equal(snap.counts.links, 1);
  assert.equal(snap.counts.iframes, 2);
  assert.equal(snap.frameCount, 3);
  assert.equal(snap.tables[0].id, 'lista');
  assert.equal(snap.tables[0].rows, 2);
  assert.match(json, /j_id#/);
  assert.match(json, /docs:#:link/);
  assert.match(json, /rich-tree/);
  assert.match(json, /inner-frame/);
  assert.match(json, /\/pje\/ConsultaDocumento\/listView\.seam/);
  assert.match(json, /"role":"grid"/);
  assert.match(json, /"type":"text"/);
  assert.equal(snap.frames.some((frame) => frame.accessible === false), true);
});

test('the snapshot stops at the node cap and says so', () => {
  assert.equal(MAX_SNAPSHOT_NODES, 5000);
  let node = el('div', { id: 'leaf' });
  for (let i = 0; i < 9; i++) node = el('div', {}, node);
  const snap = snapshotDocument(doc(node), { maxNodes: 5 });
  assert.equal(snap.nodeCount, 5);
  assert.equal(snap.truncated, true);
  assert.match(calibrationReport(snap), /interrompida no limite de nós/);
});

test('calibration filename and summary stay free of page text', () => {
  assert.equal(calibrationFilename(new Date('2026-01-02T03:04:05.006Z')), 'lume-calibracao-2026-01-02T03-04-05-006Z.json');
  assert.equal(
    calibrationReport({ nodeCount: 4, frameCount: 2, truncated: false, tables: [{ id: 'j_id#', rows: 3 }] }),
    'Nós: 4. Quadros: 2. Tabelas: j_id# (3 linhas).',
  );
  assert.match(calibrationReport({ nodeCount: 0, frameCount: 1, truncated: false, tables: [] }), /Tabelas: nenhuma\./);
});

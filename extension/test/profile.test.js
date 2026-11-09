import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTracker, panelView, parseListPage, readCase, Stop } from '../src/core.js';
import {
  activeProfiles,
  CALIBRATION_HINT,
  ERROR_COPY,
  PROFILES,
  resolveBinding,
  ROLES,
  setInstalledProfile,
  validateStoredProfile,
} from '../src/profile.js';
import { doc, el } from './dom.js';
import { page1, PAGE1, transport } from './fixtures.js';

const CNJ = '0000000-00.0000.0.00.0000';

function baseProfile(over = {}) {
  return {
    id: 'perfil-corrigido',
    unverified: true,
    layoutMarker: ['#custom-root'],
    docList: ['#custom-list'],
    docRow: ['tr.linha'],
    openLink: ['a.abrir'],
    caseNumber: [{ selector: '.numero-processo', mode: 'text' }],
    pagination: [{ nextPage: 'a.proxima', firstPage: 'a.primeira', pageInfo: '.paginacao' }],
    login: ['#loginForm'],
    ...over,
  };
}

function richPage() {
  return doc(
    el('div', { id: 'divTimeLine' },
      el('div', { class: 'rich-tree' },
        el('div', { class: 'rich-tree-node', 'data-id': 'N1', 'data-versao': '1' },
          el('a', { href: '/pje/downloadDocumento?id=N1' }, 'doc')))),
    el('header', {}, `Processo ${CNJ}`),
    el('div', { class: 'rich-datascr' }, '1 / 1'),
  );
}

function autosPage() {
  return doc(el('div', { id: 'autosDigitais' },
    el('span', { class: 'numero-processo' }, 'TEST-CASE-A'),
    el('table', {},
      el('tr', { 'data-id': 'T1', 'data-versao': '1' },
        el('a', { href: '/pje/downloadDocumento?id=T1' }, 'doc'))),
    el('span', { class: 'paginacao' }, 'Página 1 de 1'),
  ));
}

test('builtin profiles are unverified and the placeholder still reads the mock list', () => {
  assert.ok(PROFILES.every((profile) => profile.unverified === true));
  const page = parseListPage(page1(), PAGE1);
  assert.equal(page.bound.id, 'trf1-placeholder-unverified');
  assert.equal(page.bound.unverified, true);
  assert.equal(page.caseNumber, 'TEST-CASE-A');
  assert.equal(page.items[0].id, 'D1');
});

test('a RichFaces-shaped page and an autos table fall through to later profiles', () => {
  const rich = parseListPage(richPage(), PAGE1);
  assert.equal(rich.bound.id, 'trf1-pje1g-richfaces-unverified');
  assert.equal(rich.caseNumber, CNJ);
  assert.equal(rich.bound.layoutMarker, '#divTimeLine');
  assert.equal(rich.bound.docRow, '.rich-tree-node');
  assert.equal(rich.bound.openLink, 'a[href*="downloadDocumento"]');
  assert.equal(rich.bound.pageInfo, '.rich-datascr');
  assert.equal(rich.items[0].id, 'N1');
  assert.match(rich.items[0].href, /downloadDocumento/);

  const autos = parseListPage(autosPage(), PAGE1);
  assert.equal(autos.bound.id, 'trf1-autos-table-unverified');
  assert.equal(autos.bound.docRow, 'tr');
  assert.equal(autos.items[0].id, 'T1');
});

test('a bad selector is skipped and the same-origin iframe is read', async () => {
  const placeholder = PROFILES.find((profile) => profile.id === 'trf1-placeholder-unverified');
  const profiles = [{ ...placeholder, layoutMarker: ['<<<', ...placeholder.layoutMarker] }, ...PROFILES.filter((profile) => profile !== placeholder)];
  const found = resolveBinding(page1(), profiles);
  assert.equal(found.ok, true);
  assert.equal(found.profile.layoutMarker, '#autosDigitais');

  const frame = el('iframe', {});
  frame.contentDocument = page1();
  const top = doc(el('div', { id: 'chrome' }, frame));
  const inv = await readCase({ startDoc: top, startUrl: PAGE1, fetchPage: transport().fetchPage });
  assert.equal(inv.status, 'complete');
  assert.equal(inv.caseNumber, 'TEST-CASE-A');
  assert.equal(inv.items.length, 8);
});

test('a stored profile is tried first and rejected when the schema is wrong', () => {
  const input = baseProfile({ unverified: false });
  const verdict = validateStoredProfile(input);
  assert.equal(verdict.ok, true);
  input.layoutMarker.push('#extra');
  assert.deepEqual(verdict.profile.layoutMarker, ['#custom-root']);

  const page = doc(el('div', { id: 'custom-root' },
    el('span', { class: 'numero-processo' }, 'TEST-CASE-C'),
    el('table', { id: 'custom-list' },
      el('tr', { class: 'linha', 'data-id': 'C1' }, el('a', { class: 'abrir', href: '/pje/doc?id=C1' }, 'abrir'))),
    el('span', { class: 'paginacao' }, 'Página 1 de 1'),
  ));
  assert.throws(() => parseListPage(page, PAGE1), (err) => err instanceof Stop);
  setInstalledProfile(verdict.profile);
  try {
    const parsed = parseListPage(page, PAGE1);
    assert.equal(parsed.bound.id, 'perfil-corrigido');
    assert.equal(parsed.bound.unverified, false);
    assert.equal(parsed.caseNumber, 'TEST-CASE-C');
    assert.equal(activeProfiles()[0].id, 'perfil-corrigido');
  } finally {
    setInstalledProfile(null);
  }
  setInstalledProfile({ id: 'Nope' });
  assert.equal(activeProfiles()[0].id, 'trf1-list-autos-digitais-unverified');
  setInstalledProfile(null);

  const missingLogin = baseProfile();
  delete missingLogin.login;
  const rejects = [
    [null, 'O perfil precisa ser um objeto JSON.'],
    [[], 'O perfil precisa ser um objeto JSON.'],
    [baseProfile({ note: 'x' }), 'Campo desconhecido: note.'],
    [missingLogin, 'Campo obrigatório: login.'],
    [baseProfile({ id: 'Bad' }), 'id inválido.'],
    [baseProfile({ unverified: 'yes' }), 'unverified precisa ser true ou false.'],
    [baseProfile({ useDownloadAutos: 'yes' }), 'useDownloadAutos precisa ser true ou false.'],
    [baseProfile({ layoutMarker: ['div'] }), 'Seletor amplo demais em layoutMarker.'],
    [baseProfile({ layoutMarker: ['<img>'] }), 'Seletor inválido em layoutMarker.'],
    [baseProfile({ docRow: [] }), 'Lista de seletores inválida em docRow.'],
    [baseProfile({ caseNumber: [{ selector: 'header', mode: 'html' }] }), 'caseNumber inválido.'],
    [baseProfile({ pagination: [{ nextPage: 'a.proxima', firstPage: 'a.primeira', pageInfo: '.paginacao', extra: 1 }] }), 'pagination inválida.'],
    [baseProfile({ openLink: ['javascript:alert(1)'] }), 'Seletor inválido em openLink.'],
  ];
  for (const [value, error] of rejects) assert.deepEqual(validateStoredProfile(value), { ok: false, error });
  const polluted = baseProfile();
  polluted.constructor = { prototype: { admin: true } };
  assert.equal(validateStoredProfile(polluted).ok, false);
});

test('the panel names the missing role and offers calibration or the full PDF', () => {
  assert.equal(ERROR_COPY.docList, 'Não encontrei a lista de documentos.');
  assert.match(CALIBRATION_HINT, /Calibrar PJe/);
  assert.match(CALIBRATION_HINT, /PDF completo do processo \(Download dos autos\)/);
  for (const role of ROLES) {
    if (role === 'login') continue;
    assert.match(ERROR_COPY[role], /^Não encontrei /);
  }

  const missingList = doc(el('div', { id: 'autosDigitais' },
    el('span', { class: 'numero-processo' }, 'TEST-CASE-A'),
    el('span', { class: 'paginacao' }, 'Página 1 de 1'),
  ));
  assert.throws(() => parseListPage(missingList, PAGE1), (err) => err instanceof Stop && err.reason === 'incompatible_layout' && err.detail.role === 'docList');
  const tracker = createTracker({ getDoc: () => missingList, getUrl: () => PAGE1, fetchPage: async () => { throw new Error('no fetch'); }, publish() {} });
  const view = panelView(tracker.status());
  assert.equal(view.statusKey, 'incompatible_layout');
  assert.equal(view.failedRole, 'docList');
  assert.equal(view.showHint, true);
  assert.equal(ERROR_COPY[view.failedRole], 'Não encontrei a lista de documentos.');
  assert.equal(view.canStart, false);

  const html = readFileSync(new URL('../src/panel.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../src/panel.js', import.meta.url), 'utf8');
  assert.match(html, /Calibrar PJe/);
  assert.match(html, /Salvar calibração/);
  assert.match(html, /envie este arquivo ao Grok/);
  assert.match(html, />Copiar</);
  assert.match(html, /Carregar perfil/);
  assert.match(html, /Não contém texto do processo/);
  assert.match(html, /Estudar processo/);
  assert.match(js, /CALIBRATION_HINT/);
  assert.match(js, /ERROR_COPY/);
  assert.match(js, /CALIBRATION_DOWNLOAD_NAME/);
  assert.match(js, /validateStoredProfile/);
  assert.doesNotMatch(js, /\.click\(/);
});

// Selector profiles. Every builtin candidate is UNVERIFIED: nobody has seen the live PJe DOM.
// A profile loaded from chrome.storage.local is tried first. Nothing here reads page text into
// a calibration file; case-number text stays in the inventory the panel already shows.

import { sameOriginDocuments } from './calibrate.js';
import { URL_RULE_IDS } from './url-rules.js';

export const CNJ_RE = /\d{7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4}/;
export const ROLES = ['layoutMarker', 'docList', 'docRow', 'openLink', 'caseNumber', 'pagination', 'login'];
const ROLE_RANK = { layoutMarker: 1, docList: 2, caseNumber: 3, docRow: 4, openLink: 5, pagination: 6 };

export const ERROR_COPY = {
  layoutMarker: 'Não encontrei o marcador da página do processo.',
  docList: 'Não encontrei a lista de documentos.',
  docRow: 'Não encontrei as linhas de documentos.',
  openLink: 'Não encontrei o link de abertura do documento.',
  caseNumber: 'Não encontrei o número do processo.',
  pagination: 'Não encontrei a paginação da lista.',
};

export const CALIBRATION_HINT = 'Abra Calibrar PJe para gravar a estrutura da página, sem conteúdo do processo, e envie o JSON ao Grok. Alternativa: use o PDF completo do processo (Download dos autos).';

const DOWNLOAD_AUTOS = ['a[href*="downloadAutos"]', 'a[href*="gerarPdf"]', 'a[href*="downloadDosAutos"]', '#linkDownloadAutos'];

const PLACEHOLDER = {
  id: 'trf1-placeholder-unverified',
  unverified: true,
  layoutMarker: ['#autosDigitais'],
  docList: ['#listaDocumentos'],
  docRow: ['tr.documento'],
  openLink: ['a.abrir'],
  caseNumber: [{ selector: '.numero-processo', mode: 'text' }],
  pagination: [{ nextPage: 'a.proxima', firstPage: 'a.primeira', pageInfo: '.paginacao' }],
  login: ['#loginForm'],
  downloadAutos: DOWNLOAD_AUTOS,
};

// Public shape of PJe 1g (JSF / RichFaces). Not checked against a permitted case.
const RICHFACES = {
  id: 'trf1-pje1g-richfaces-unverified',
  unverified: true,
  layoutMarker: ['#divTimeLine', '.rich-tree'],
  docList: ['#divTimeLine .rich-tree', '.rich-tree', '#divTimeLine'],
  docRow: ['.rich-tree-node', 'tbody tr', 'tr'],
  openLink: ['a[href*="downloadDocumento"]', 'a[href*="ConsultaDocumento/listView.seam"]'],
  caseNumber: [
    { selector: '.numero-processo', mode: 'text' },
    { selector: '#numeroProcesso', mode: 'text' },
    { selector: 'header', mode: 'cnj' },
    { selector: 'h1', mode: 'cnj' },
  ],
  pagination: [
    { nextPage: 'a.proxima', firstPage: 'a.primeira', pageInfo: '.paginacao' },
    { nextPage: '.rich-datascr-button-dsnext', firstPage: '.rich-datascr-button-dsfirst', pageInfo: '.rich-datascr' },
  ],
  login: ['#loginForm', '#login', 'form[id*="login"]'],
  downloadAutos: DOWNLOAD_AUTOS,
};

const AUTOS_TABLE = {
  id: 'trf1-autos-table-unverified',
  unverified: true,
  layoutMarker: ['#autosDigitais'],
  docList: ['#autosDigitais table'],
  docRow: ['tr'],
  openLink: ['a[href*="downloadDocumento"]', 'a[href*="ConsultaDocumento/listView.seam"]'],
  caseNumber: [
    { selector: '.numero-processo', mode: 'text' },
    { selector: 'header', mode: 'cnj' },
    { selector: 'h1', mode: 'cnj' },
  ],
  pagination: [{ nextPage: 'a.proxima', firstPage: 'a.primeira', pageInfo: '.paginacao' }],
  login: ['#loginForm', 'form[id*="login"]'],
  downloadAutos: DOWNLOAD_AUTOS,
};

export const PROFILES = [PLACEHOLDER, RICHFACES, AUTOS_TABLE];

const ATTR_RE = /^[A-Za-z_:][\w:.-]{0,40}$/;
const TOO_BROAD = new Set(['*', 'div', 'span', 'body', 'html', 'td', 'a', 'input', 'form', 'table', 'p']);
const SELECTOR_RE = /^[A-Za-z0-9_#.:\s>[\]="*^$~|+\-/(),]+$/;
const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

let installed = null;

export function activeProfiles() {
  return installed ? [installed, ...PROFILES] : PROFILES.slice();
}

export function setInstalledProfile(profile) {
  if (profile == null) { installed = null; return; }
  const v = validateStoredProfile(profile);
  installed = v.ok ? v.profile : null;
}

export function safeQuery(root, selector) {
  if (!root || !selector) return null;
  try { return root.querySelector(selector); } catch { return null; }
}

export function safeQueryAll(root, selector) {
  if (!root || !selector) return [];
  try { return Array.from(root.querySelectorAll(selector)); } catch { return []; }
}

function selectorError(role) {
  return `Seletor inválido em ${role}.`;
}

function checkSelector(sel, role) {
  if (typeof sel !== 'string') return selectorError(role);
  const s = sel.trim();
  if (!s || s.length > 200 || s !== sel) return selectorError(role);
  if (TOO_BROAD.has(s)) return `Seletor amplo demais em ${role}.`;
  if (!SELECTOR_RE.test(s) || /javascript:|expression\(|url\(/i.test(s) || /[<>{}\\;]/.test(s)) return selectorError(role);
  return null;
}

function checkSelectorList(value, role) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return `Lista de seletores inválida em ${role}.`;
  for (const sel of value) {
    const err = checkSelector(sel, role);
    if (err) return err;
  }
  return null;
}

function copyCaseNumber(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return { error: 'Lista de seletores inválida em caseNumber.' };
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'caseNumber inválido.' };
    const keys = Object.keys(item);
    if (keys.length !== 2 || !keys.includes('selector') || !keys.includes('mode')) return { error: 'caseNumber inválido.' };
    if (item.mode !== 'text' && item.mode !== 'cnj') return { error: 'caseNumber inválido.' };
    const err = checkSelector(item.selector, 'caseNumber');
    if (err) return { error: err };
    out.push({ selector: item.selector, mode: item.mode });
  }
  return { list: out };
}

function copyPagination(value) {
  if (!Array.isArray(value) || value.length === 0 || value.length > 8) return { error: 'Lista de seletores inválida em pagination.' };
  const out = [];
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return { error: 'pagination inválida.' };
    const keys = Object.keys(item);
    if (keys.length !== 3 || !keys.includes('nextPage') || !keys.includes('firstPage') || !keys.includes('pageInfo')) {
      return { error: 'pagination inválida.' };
    }
    for (const part of ['nextPage', 'firstPage', 'pageInfo']) {
      const err = checkSelector(item[part], 'pagination');
      if (err) return { error: err };
    }
    out.push({ nextPage: item.nextPage, firstPage: item.firstPage, pageInfo: item.pageInfo });
  }
  return { list: out };
}

function copyAttr(input, key) {
  if (!Object.prototype.hasOwnProperty.call(input, key)) return { value: undefined };
  if (typeof input[key] !== 'string' || !ATTR_RE.test(input[key])) return { error: `${key} inválido.` };
  return { value: input[key] };
}

function copyUrlRules(input) {
  if (!Object.prototype.hasOwnProperty.call(input, 'urlRules')) return { list: undefined };
  const value = input.urlRules;
  if (!Array.isArray(value) || value.length === 0 || value.length > URL_RULE_IDS.length) return { error: 'urlRules inválidas.' };
  const out = [];
  for (const id of value) {
    if (typeof id !== 'string' || !URL_RULE_IDS.includes(id) || out.includes(id)) return { error: 'urlRules inválidas.' };
    out.push(id);
  }
  return { list: out };
}

export function validateStoredProfile(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'O perfil precisa ser um objeto JSON.' };
  const required = ['id', 'unverified', 'layoutMarker', 'docList', 'docRow', 'openLink', 'caseNumber', 'pagination', 'login'];
  const optional = ['downloadAutos', 'docIdAttr', 'versionAttr', 'pagesAttr', 'kindAttr', 'parentAttr', 'urlRules'];
  for (const key of Object.keys(input)) {
    if (!required.includes(key) && !optional.includes(key)) return { ok: false, error: `Campo desconhecido: ${key}.` };
  }
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(input, key)) return { ok: false, error: `Campo obrigatório: ${key}.` };
  }
  if (typeof input.id !== 'string' || !ID_RE.test(input.id)) return { ok: false, error: 'id inválido.' };
  if (typeof input.unverified !== 'boolean') return { ok: false, error: 'unverified precisa ser true ou false.' };
  for (const role of ['layoutMarker', 'docList', 'docRow', 'openLink', 'login']) {
    const err = checkSelectorList(input[role], role);
    if (err) return { ok: false, error: err };
  }
  const caseNumber = copyCaseNumber(input.caseNumber);
  if (caseNumber.error) return { ok: false, error: caseNumber.error };
  const pagination = copyPagination(input.pagination);
  if (pagination.error) return { ok: false, error: pagination.error };
  let downloadAutos;
  if (Object.prototype.hasOwnProperty.call(input, 'downloadAutos')) {
    const err = checkSelectorList(input.downloadAutos, 'downloadAutos');
    if (err) return { ok: false, error: err };
    downloadAutos = input.downloadAutos.slice();
  }
  const attrs = {};
  for (const key of ['docIdAttr', 'versionAttr', 'pagesAttr', 'kindAttr', 'parentAttr']) {
    const copied = copyAttr(input, key);
    if (copied.error) return { ok: false, error: copied.error };
    if (copied.value) attrs[key] = copied.value;
  }
  const urlRules = copyUrlRules(input);
  if (urlRules.error) return { ok: false, error: urlRules.error };
  return {
    ok: true,
    profile: {
      id: input.id,
      unverified: input.unverified,
      layoutMarker: input.layoutMarker.slice(),
      docList: input.docList.slice(),
      docRow: input.docRow.slice(),
      openLink: input.openLink.slice(),
      caseNumber: caseNumber.list,
      pagination: pagination.list,
      login: input.login.slice(),
      ...(downloadAutos ? { downloadAutos } : {}),
      ...attrs,
      ...(urlRules.list ? { urlRules: urlRules.list } : {}),
    },
  };
}

export function readCaseNumber(doc, profile) {
  const el = safeQuery(doc, profile.caseNumber);
  if (!el) return '';
  const raw = String(el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (profile.caseNumberMode === 'cnj') return raw.match(CNJ_RE)?.[0] ?? '';
  return raw.length > 80 ? '' : raw;
}

function caseHit(doc, spec) {
  const el = safeQuery(doc, spec.selector);
  if (!el) return null;
  const raw = String(el.textContent ?? '').replace(/\s+/g, ' ').trim();
  if (spec.mode === 'cnj') return raw.match(CNJ_RE)?.[0] ?? null;
  if (!raw || raw.length > 80) return null;
  return raw;
}

export function resolveBinding(doc, profiles) {
  let best = null;
  for (const profile of profiles) {
    const layout = profile.layoutMarker.map((s) => safeQuery(doc, s) && s).find(Boolean);
    if (!layout) { best = best ?? { role: 'layoutMarker', profileId: profile.id }; continue; }
    const docList = profile.docList.map((s) => safeQuery(doc, s) && s).find(Boolean);
    if (!docList) { if (!best || ROLE_RANK.docList > ROLE_RANK[best.role]) best = { role: 'docList', profileId: profile.id }; continue; }
    const list = safeQuery(doc, docList);
    let caseSpec = null;
    for (const spec of profile.caseNumber) {
      if (caseHit(doc, spec)) { caseSpec = spec; break; }
    }
    if (!caseSpec) { if (!best || ROLE_RANK.caseNumber > ROLE_RANK[best.role]) best = { role: 'caseNumber', profileId: profile.id }; continue; }
    const docRow = profile.docRow.map((s) => safeQueryAll(list, s).length > 0 && s).find(Boolean);
    if (!docRow) { if (!best || ROLE_RANK.docRow > ROLE_RANK[best.role]) best = { role: 'docRow', profileId: profile.id }; continue; }
    const openLink = profile.openLink.map((s) => safeQueryAll(list, s).length > 0 && s).find(Boolean);
    if (!openLink) { if (!best || ROLE_RANK.openLink > ROLE_RANK[best.role]) best = { role: 'openLink', profileId: profile.id }; continue; }
    const page = profile.pagination.find((c) => safeQuery(doc, c.pageInfo));
    if (!page) { if (!best || ROLE_RANK.pagination > ROLE_RANK[best.role]) best = { role: 'pagination', profileId: profile.id }; continue; }
    const login = [...new Set(profiles.flatMap((p) => p.login ?? []))];
    return {
      ok: true,
      profile: {
        bound: true,
        id: profile.id,
        unverified: profile.unverified !== false,
        layoutMarker: layout,
        docList,
        docRow,
        openLink,
        caseNumber: caseSpec.selector,
        caseNumberMode: caseSpec.mode,
        nextPage: page.nextPage,
        firstPage: page.firstPage,
        pageInfo: page.pageInfo,
        loginMarker: login[0] ?? null,
        loginSelectors: login,
        docIdAttr: profile.docIdAttr || 'data-id',
        versionAttr: profile.versionAttr || 'data-versao',
        pagesAttr: profile.pagesAttr || 'data-paginas',
        kindAttr: profile.kindAttr || 'data-tipo',
        parentAttr: profile.parentAttr || 'data-pai',
        downloadAutos: (profile.downloadAutos ?? []).slice(),
        urlRules: profile.urlRules ? profile.urlRules.slice() : null,
      },
    };
  }
  return { ok: false, role: best?.role ?? 'layoutMarker', profileId: best?.profileId ?? null };
}

export function documentIsLogin(doc, profiles) {
  const list = Array.isArray(profiles) ? profiles : [profiles];
  const login = [...new Set(list.flatMap((p) => p.loginSelectors ?? p.login ?? []))];
  const layouts = [...new Set(list.flatMap((p) => (p.bound ? [p.layoutMarker] : p.layoutMarker ?? [])))];
  if (!login.some((s) => safeQuery(doc, s))) return false;
  if (layouts.some((s) => safeQuery(doc, s))) return false;
  return true;
}

export function resolvePage(doc, profiles = activeProfiles()) {
  const docs = sameOriginDocuments(doc);
  let best = null;
  for (const candidate of docs) {
    const found = resolveBinding(candidate, profiles);
    if (found.ok) return { ok: true, login: false, doc: candidate, profile: found.profile };
    if (!best || ROLE_RANK[found.role] > ROLE_RANK[best.role]) best = found;
  }
  if (docs.some((d) => documentIsLogin(d, profiles))) return { ok: false, login: true, role: null, profileId: null };
  return { ok: false, login: false, role: best?.role ?? 'layoutMarker', profileId: best?.profileId ?? null };
}

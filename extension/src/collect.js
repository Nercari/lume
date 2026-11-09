// Collects every document of the open case through the page session.
// Each document's own PDF, HTML or image is fetched in memory. There is no
// download dialog, no chrome.downloads call, and no file on disk.
// A link that matches no named URL rule is listed and not fetched.
// The full-autos PDF is optional. Only a profile with useDownloadAutos fetches
// that endpoint, and only then instead of each document. Scanned pages are
// read from the document binary, then OCR'd locally.

import { sameOriginDocuments } from './calibrate.js';
import { parseListPage, Stop } from './core.js';
import { safeQueryAll } from './profile.js';
import { urlPattern } from './sanitize.js';
import { matchUrlRule, URL_RULE_IDS } from './url-rules.js';

const SUPPORTED = new Set([
  'application/pdf',
  'text/html',
  'text/plain',
  'image/jpeg',
  'image/png',
  'image/tiff',
  'image/tif',
]);

const typeOf = (value) => String(value ?? '').split(';')[0].trim().toLowerCase();

export function findDownloadAutos(doc, profile) {
  const selectors = profile?.downloadAutos ?? [];
  const misses = [];
  for (const root of sameOriginDocuments(doc)) {
    for (const selector of selectors) {
      for (const node of safeQueryAll(root, selector)) {
        const href = node.getAttribute?.('href') || node.getAttribute?.('action');
        if (!href) {
          misses.push({ id: null, reason: 'autos', detail: `seletor ${selector} sem href`, hrefPattern: null });
          continue;
        }
        const rule = matchUrlRule(href, profile.urlRules ?? null);
        if (!rule || rule.kind !== 'autos') {
          misses.push({
            id: null,
            reason: 'autos',
            detail: `seletor ${selector} não casa a regra download-autos`,
            hrefPattern: urlPattern(href),
          });
          continue;
        }
        return { raw: href, rule: rule.id, misses };
      }
    }
  }
  return { raw: null, rule: null, misses };
}

function absolute(href, base) {
  return new URL(href, base).href;
}

export async function collectCase({
  startDoc,
  startUrl,
  fetchBytes,
  isCurrent = () => true,
  signal,
  onProgress = () => {},
  onDocument = async () => {},
  profile = null,
}) {
  const origin = new URL(startUrl).origin;
  const misses = [];
  const items = [];
  const documents = [];
  const state = { caseNumber: null, mode: 'documents', status: 'reading', items, misses, documents };
  const emit = () => onProgress({ ...state, items: items.map((item) => ({ ...item })), misses: misses.slice() });
  const guard = () => {
    if (signal?.aborted) throw new Stop(signal.reason === 'user' ? 'stopped_by_user' : 'invalidated');
    if (!isCurrent()) throw new Stop('invalidated');
  };
  const get = async (url) => {
    if (new URL(url).origin !== origin) throw new Stop('incompatible_layout', 'cross-origin link refused');
    guard();
    const res = await fetchBytes(url, signal);
    guard();
    return res;
  };

  try {
    let page = parseListPage(startDoc, startUrl, profile);
    const bound = page.bound;
    state.caseNumber = page.caseNumber;
    let url = startUrl;
    if (page.pageInfo && page.pageInfo.current !== 1) {
      if (!page.first) throw new Stop('incompatible_layout', 'no link to the first list page');
      const res = await get(page.first);
      if (res.status < 200 || res.status > 299 || !res.doc) throw new Stop('incompatible_layout', 'first list page unreadable');
      page = parseListPage(res.doc, page.first, bound);
      url = page.first ? page.first : url;
    }
    const seen = new Set([url]);
    const ids = new Set();
    let guardDoc = startDoc;
    for (let n = 1; ; n += 1) {
      if (page.caseNumber !== state.caseNumber) throw new Stop('invalidated', 'list belongs to another case');
      for (const item of page.items) {
        if (ids.has(item.id)) throw new Stop('inventory_changed', 'document listed twice');
        ids.add(item.id);
        items.push({ ...item, state: 'pending', detail: null, rule: null });
      }
      emit();
      if (!page.next) break;
      if (seen.has(page.next) || n >= 500) throw new Stop('incompatible_layout', 'pagination loop');
      seen.add(page.next);
      const res = await get(page.next);
      if (res.status < 200 || res.status > 299 || !res.doc) {
        misses.push({ id: null, reason: 'list', detail: `página da lista ${n + 1} ilegível`, hrefPattern: urlPattern(page.next) });
        break;
      }
      guardDoc = res.doc;
      page = parseListPage(res.doc, page.next, bound);
    }

    if (bound.useDownloadAutos === true) {
      const autos = findDownloadAutos(startDoc, bound);
      for (const miss of autos.misses) misses.push(miss);
      if (autos.raw) {
        const autosUrl = absolute(autos.raw, startUrl);
        const res = await get(autosUrl);
        const type = typeOf(res.contentType);
        const bytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes ?? []);
        if (res.status === 403) {
          misses.push({ id: null, reason: 'autos', detail: 'http 403', hrefPattern: urlPattern(autosUrl) });
        } else if (res.status < 200 || res.status > 299 || type !== 'application/pdf' || bytes.byteLength === 0) {
          misses.push({
            id: null,
            reason: 'autos',
            detail: bytes.byteLength === 0 ? 'corpo vazio' : `http ${res.status} ${type || 'sem tipo'}`,
            hrefPattern: urlPattern(autosUrl),
          });
        } else {
          state.mode = 'autos';
          const doc = { id: 'autos', version: '1', contentType: type, bytes, source: 'download-autos', rule: autos.rule, index: 1, total: 1 };
          documents.push({ id: doc.id, contentType: type, bytes: bytes.byteLength, rule: autos.rule });
          for (const item of items) {
            item.state = 'processed';
            item.detail = 'download-autos';
            item.rule = autos.rule;
          }
          emit();
          await onDocument(doc);
          state.status = 'complete';
          emit();
          return { ...state, autosDoc: doc, listDoc: guardDoc };
        }
      }
    }

    let index = 0;
    for (const item of items) {
      guard();
      index += 1;
      if (!item.href) {
        item.state = 'missing';
        item.detail = 'sem link na lista';
        misses.push({ id: item.id, reason: 'missing', detail: item.detail, hrefPattern: null });
        emit();
        continue;
      }
      const rule = matchUrlRule(item.href, bound.urlRules ?? null);
      if (!rule || rule.kind !== 'document') {
        item.state = 'failed';
        item.rule = rule?.id ?? null;
        item.detail = rule
          ? `regra ${rule.id} não é documento`
          : `nenhuma regra de URL (${URL_RULE_IDS.join(', ')})`;
        misses.push({ id: item.id, reason: 'no_url_rule', detail: item.detail, hrefPattern: urlPattern(item.href), rule: rule?.id ?? null });
        emit();
        continue;
      }
      item.rule = rule.id;
      let res;
      try {
        res = await get(item.href);
      } catch (error) {
        if (error instanceof Stop) throw error;
        item.state = 'failed';
        item.detail = 'erro de rede';
        misses.push({ id: item.id, reason: 'network', detail: item.detail, hrefPattern: urlPattern(item.href), rule: rule.id });
        emit();
        continue;
      }
      if (res.status === 401) throw new Stop('session_expired');
      if (res.status === 403) {
        item.state = 'restricted';
        item.detail = 'http 403';
        misses.push({ id: item.id, reason: 'restricted', detail: item.detail, hrefPattern: urlPattern(item.href), rule: rule.id });
        emit();
        continue;
      }
      if (res.status === 404 || res.status === 410) {
        item.state = 'missing';
        item.detail = `http ${res.status}`;
        misses.push({ id: item.id, reason: 'missing', detail: item.detail, hrefPattern: urlPattern(item.href), rule: rule.id });
        emit();
        continue;
      }
      if (res.status < 200 || res.status > 299) {
        item.state = 'failed';
        item.detail = `http ${res.status}`;
        misses.push({ id: item.id, reason: 'http', detail: item.detail, hrefPattern: urlPattern(item.href), rule: rule.id });
        emit();
        continue;
      }
      const type = typeOf(res.contentType);
      const bytes = res.bytes instanceof Uint8Array ? res.bytes : new Uint8Array(res.bytes ?? []);
      if (!SUPPORTED.has(type)) {
        item.state = 'unsupported';
        item.detail = type || 'tipo desconhecido';
        misses.push({ id: item.id, reason: 'unsupported', detail: item.detail, hrefPattern: urlPattern(item.href), rule: rule.id });
        emit();
        continue;
      }
      if (bytes.byteLength === 0) {
        item.state = 'failed';
        item.detail = 'corpo vazio';
        misses.push({ id: item.id, reason: 'empty', detail: item.detail, hrefPattern: urlPattern(item.href), rule: rule.id });
        emit();
        continue;
      }
      item.state = 'processed';
      item.detail = null;
      const doc = { id: item.id, version: item.version || '1', contentType: type, bytes, source: 'document', rule: rule.id, index, total: items.length };
      documents.push({ id: doc.id, contentType: type, bytes: bytes.byteLength, rule: rule.id });
      emit();
      await onDocument(doc);
    }
    state.status = misses.some((miss) => miss.reason === 'list') ? 'incomplete' : 'complete';
  } catch (error) {
    state.status = 'stopped';
    state.stopReason = error instanceof Stop ? error.reason : 'error';
    state.stopDetail = error instanceof Stop ? error.detail : String(error?.message ?? error);
    misses.push({
      id: null,
      reason: state.stopReason,
      detail: typeof state.stopDetail === 'string' ? state.stopDetail : 'leitura interrompida',
      hrefPattern: null,
    });
  }
  emit();
  return state;
}

// Named URL rules for PJe TRF1. Every pattern the collector accepts is one of these.
// Live pages are UNVERIFIED: the shapes are the public paths people report, not a
// capture from a permitted case. A link that matches none is listed and not fetched.

export const URL_RULES = Object.freeze([
  Object.freeze({
    id: 'download-autos',
    kind: 'autos',
    template: '/pje/.../downloadAutos.seam | gerarPdf | downloadDosAutos',
    test: (url) => /downloadAutos|gerarPdf|downloadDosAutos/i.test(url.pathname),
  }),
  Object.freeze({
    id: 'documento-download',
    kind: 'document',
    template: '/documento/download/<id>',
    test: (url) => /\/documento\/download\/[^/]+/i.test(url.pathname),
  }),
  Object.freeze({
    id: 'download-binario',
    kind: 'document',
    template: '/downloadBinario.seam',
    test: (url) => url.pathname.toLowerCase().includes('/downloadbinario.seam'),
  }),
  Object.freeze({
    id: 'download-documento',
    kind: 'document',
    template: '/downloadDocumento',
    test: (url) => url.pathname.toLowerCase().includes('downloaddocumento'),
  }),
  Object.freeze({
    id: 'consulta-documento',
    kind: 'document',
    template: '/ConsultaDocumento/listView.seam?idDocumento=',
    test: (url) => listView(url) && ['id', 'iddocumento', 'ca', 'idbinario'].some((key) => hasKey(url, key)),
  }),
  Object.freeze({
    id: 'consulta-list-view',
    kind: 'list',
    template: '/ConsultaDocumento/listView.seam',
    test: (url) => listView(url),
  }),
  Object.freeze({
    id: 'doc-query-id',
    kind: 'document',
    template: '/doc?id=<id>',
    test: (url) => /\/doc$/i.test(url.pathname) && hasKey(url, 'id'),
  }),
]);

export const URL_RULE_IDS = Object.freeze(URL_RULES.map((rule) => rule.id));

function listView(url) {
  return url.pathname.toLowerCase().includes('/consultadocumento/listview.seam');
}

function hasKey(url, name) {
  for (const key of url.searchParams.keys()) {
    if (key.toLowerCase() === name) return true;
  }
  return false;
}

export function matchUrlRule(href, allowed = null) {
  if (typeof href !== 'string' || !href) return null;
  let url;
  try { url = new URL(href, 'https://pje.invalid'); } catch { return null; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  for (const rule of URL_RULES) {
    if (Array.isArray(allowed) && !allowed.includes(rule.id)) continue;
    if (rule.test(url)) return { id: rule.id, kind: rule.kind, template: rule.template };
  }
  return null;
}

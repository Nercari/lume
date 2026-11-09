import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchUrlRule, URL_RULE_IDS, URL_RULES } from '../src/url-rules.js';
import { urlPattern } from '../src/sanitize.js';

const CASES = [
  ['download-autos', 'https://pje1g.trf1.jus.br/pje/downloadAutos.seam', 'autos'],
  ['download-autos', 'https://pje1g.trf1.jus.br/pje/seam/resource/gerarPdf', 'autos'],
  ['download-autos', 'https://pje2g.trf1.jus.br/pje/downloadDosAutos.seam', 'autos'],
  ['documento-download', 'https://pje1g.trf1.jus.br/pje/documento/download/DOC1', 'document'],
  ['download-binario', 'https://pje1g.trf1.jus.br/pje/downloadBinario.seam?idBinario=1', 'document'],
  ['download-documento', 'https://pje1g.trf1.jus.br/pje/downloadDocumento?id=1', 'document'],
  ['consulta-documento', 'https://pje1g.trf1.jus.br/pje/ConsultaDocumento/listView.seam?idDocumento=10', 'document'],
  ['consulta-list-view', 'https://pje1g.trf1.jus.br/pje/ConsultaDocumento/listView.seam', 'list'],
  ['doc-query-id', 'https://pje1g.trf1.jus.br/pje/doc?id=D1', 'document'],
];

test('every named URL rule matches its template and nothing else is silent', () => {
  assert.deepEqual(URL_RULES.map((rule) => rule.id), [...URL_RULE_IDS]);
  assert.equal(new Set(URL_RULE_IDS).size, URL_RULE_IDS.length);
  for (const [id, href, kind] of CASES) {
    const hit = matchUrlRule(href);
    assert.equal(hit?.id, id, href);
    assert.equal(hit?.kind, kind, href);
  }
  assert.equal(matchUrlRule('https://pje1g.trf1.jus.br/pje/static/logo.png'), null);
  assert.equal(matchUrlRule('javascript:alert(1)'), null);
  assert.equal(matchUrlRule(''), null);
});

test('a profile can allow only some rules', () => {
  const href = 'https://pje1g.trf1.jus.br/pje/doc?id=D1';
  assert.equal(matchUrlRule(href, ['documento-download']), null);
  assert.equal(matchUrlRule(href, ['doc-query-id'])?.id, 'doc-query-id');
});

test('url patterns drop query values and replace digit runs with N', () => {
  const pattern = urlPattern('https://pje1g.trf1.jus.br/pje/documento/download/99887766?numero=0000000-00.0000.0.00.0000&nome=Nome%20Ficticio');
  assert.equal(pattern, '/pje/documento/download/N?numero&nome');
  assert.equal(pattern.includes('99887766'), false);
  assert.equal(pattern.includes('Nome'), false);
  assert.equal(pattern.includes('0000000'), false);
});

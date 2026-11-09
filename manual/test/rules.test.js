import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyFooterRules,
  footerAssinado,
  footerConsultaUrl,
  footerNumPag,
  footerNumeroDocumento,
  indexHeader,
  indexRowDated,
  indexRowIdTitle,
  matchFooterText,
  matchPageFooter,
  outlineIdPrefix,
  outlineIdSuffix,
  outlineTitle,
  parseOutlineTitle,
} from '../src/rules.js';

test('footer_num_pag reads id and page with or without accents', () => {
  for (const sample of ['Num. 1001 - Pág. 2', 'Nº 1001 – Pagina 3', 'NUMERO 88 - PAG. 1']) {
    const hit = applyFooterRules(sample).find((item) => item.id === footerNumPag.id);
    assert.ok(hit, sample);
    assert.match(hit.docId, /^\d+$/);
    assert.equal(typeof hit.pageInDoc, 'number');
  }
  const parsed = matchFooterText('Num. 1001 - Pág. 2');
  assert.deepEqual({ docId: parsed.docId, pageInDoc: parsed.pageInDoc }, { docId: '1001', pageInDoc: 2 });
});

test('footer_numero_documento and footer_consulta_url each yield an id', () => {
  const numbered = matchFooterText('Número do documento: 1001');
  assert.equal(numbered.docId, '1001');
  assert.equal(numbered.pageInDoc, null);
  assert.ok(numbered.rules.includes(footerNumeroDocumento.id));

  const linked = matchFooterText('https://exemplo.invalid/pje/ConsultaDocumento/listView.seam?x=1001');
  assert.equal(linked.docId, '1001');
  assert.ok(linked.rules.includes(footerConsultaUrl.id));
  const withParam = matchFooterText('ConsultaDocumento/listView.seam?a=1&x=44');
  assert.equal(withParam.docId, '44');
});

test('footer_assinado matches the signature phrase and does not invent an id', () => {
  const hits = applyFooterRules('Assinado eletronicamente por: PARTE ALFA - 01/02/2020 09:00:00');
  assert.deepEqual(hits.map((hit) => hit.id), [footerAssinado.id]);
  assert.equal(matchFooterText('Assinado eletronicamente por: PARTE ALFA - 01/02/2020 09:00:00'), null);
  assert.equal(applyFooterRules('Assinado eletronico').length, 0);
});

test('disagreeing footer ids are flagged and Num./Pág. wins', () => {
  const parsed = matchFooterText('Num. 1001 - Pag. 2\nNúmero do documento: 9999');
  assert.equal(parsed.docId, '1001');
  assert.equal(parsed.pageInDoc, 2);
  assert.equal(parsed.conflict, true);
});

test('a body mention of numero do documento does not beat an empty footer band', () => {
  const lines = [
    { text: 'Numero do documento: 55', y: 700 },
    { text: 'Texto da peca.', y: 680 },
  ];
  assert.equal(matchPageFooter(lines, 792), null);
});

test('the footer band wins over the same phrase higher on the page', () => {
  const lines = [
    { text: 'Numero do documento: 55', y: 700 },
    { text: 'Num. 1001 - Pag. 4', y: 40 },
  ];
  const parsed = matchPageFooter(lines, 792);
  assert.equal(parsed.docId, '1001');
  assert.equal(parsed.pageInDoc, 4);
});

test('index_header accepts the column line and rejects a sentence', () => {
  assert.equal(indexHeader.test('Id Data Documento/Tipo'), true);
  assert.equal(indexHeader.test('Id | Data | Documento'), true);
  assert.equal(indexHeader.test('Validacao do id na data do evento'), false);
});

test('index rows keep title and type', () => {
  const dated = indexRowDated.parse('1001 01/02/2020 Peticao Inicial / Peticao');
  assert.equal(dated.rule, 'index_row_dated');
  assert.equal(dated.docId, '1001');
  assert.equal(dated.title, 'Peticao Inicial');
  assert.equal(dated.type, 'Peticao');
  const bare = indexRowIdTitle.parse('1002 Contestacao');
  assert.equal(bare.rule, 'index_row_id_title');
  assert.equal(bare.docId, '1002');
  assert.equal(indexRowDated.parse('sem id'), null);
});

test('outline rules: prefix, suffix, and title only', () => {
  assert.deepEqual(outlineIdPrefix.parse('1001 - Peticao Inicial'), {
    rule: 'outline_id_prefix', docId: '1001', title: 'Peticao Inicial',
  });
  assert.deepEqual(outlineIdSuffix.parse('Contestacao - 1002'), {
    rule: 'outline_id_suffix', docId: '1002', title: 'Contestacao',
  });
  assert.equal(outlineTitle.parse('So o titulo').rule, 'outline_title');
  assert.equal(outlineTitle.parse('1001 - Peticao'), null);
  assert.equal(parseOutlineTitle(''), null);
});

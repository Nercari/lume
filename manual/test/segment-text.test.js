import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TEXT_BLOCK_CHARS, TEXT_RULES, segmentText } from '../src/segment-text.js';
import { buildCasePack } from '../src/pack.js';

const BODY = 'Texto sintetico desta peca, longo o bastante para nao ser lacuna.';

test('footer_num_pag keeps Num. and Pág. and groups pages of the same id', () => {
  const text = [
    `${BODY} Primeira folha.`,
    'Num. 1001 - Pág. 1',
    `${BODY} Segunda folha.`,
    'Num. 1001 - Pág. 2',
    `${BODY} Outra peca.`,
    'Num. 1002 - Pág. 1',
  ].join('\n');
  const result = segmentText(text);
  assert.ok(result.rules.includes(TEXT_RULES.footerNumPag.id));
  assert.deepEqual(result.documents.map((doc) => doc.docId), ['1001', '1002']);
  const first = result.documents[0];
  assert.ok(first.rules.includes(TEXT_RULES.footerNumPag.id));
  assert.deepEqual(result.pages.filter((page) => page.docId === '1001').map((page) => page.pageInDoc), [1, 2]);
  assert.equal(result.pages.find((page) => page.docId === '1002').pageInDoc, 1);
  assert.match(buildCasePack(result), /\[ID 1001, pág\. 2\]/);
});

test('numero_documento splits pieces on Número do documento', () => {
  const text = [
    'Número do documento: 1001',
    BODY,
    '',
    'Número do documento: 1002',
    `${BODY} Segunda.`,
  ].join('\n');
  const result = segmentText(text);
  assert.ok(result.rules.includes(TEXT_RULES.numeroDocumento.id));
  assert.deepEqual(result.documents.map((doc) => doc.docId), ['1001', '1002']);
  assert.equal(result.documents[0].rules.includes(TEXT_RULES.numeroDocumento.id), true);
});

test('heading_id accepts Id, Id: and ID do documento', () => {
  const text = [
    'Id 1001',
    BODY,
    '',
    'Id: 1002',
    `${BODY} Segunda.`,
    '',
    'ID do documento: 1003',
    `${BODY} Terceira.`,
  ].join('\n');
  const result = segmentText(text);
  assert.ok(result.rules.includes(TEXT_RULES.headingId.id));
  assert.deepEqual(result.documents.map((doc) => doc.docId), ['1001', '1002', '1003']);
});

test('form_feed is a page break inside one document when no id follows', () => {
  const text = `${BODY} Folha um.\f${BODY} Folha dois.`;
  const result = segmentText(text);
  assert.ok(result.rules.includes(TEXT_RULES.formFeed.id));
  assert.equal(result.rules.includes(TEXT_RULES.fallbackSemId.id), false);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].docId, 'sem-id');
  assert.deepEqual(result.pages.map((page) => page.pageInDoc), [1, 2]);
  assert.equal(result.pages.every((page) => page.hasText), true);
});

test('title_then_type uses classify.js on a title line followed by a type word', () => {
  const text = [
    'Pedido de juntada',
    'Petição',
    '',
    `${BODY} Da peticao.`,
    '',
    'Analise do perito',
    'Laudo',
    '',
    `${BODY} Do laudo.`,
    '',
    'Sentença',
    '',
    `${BODY} Da sentenca.`,
  ].join('\n');
  const result = segmentText(text);
  assert.ok(result.rules.includes(TEXT_RULES.titleThenType.id));
  assert.deepEqual(result.documents.map((doc) => doc.piece), ['petição inicial', 'laudo', 'sentença']);
  assert.equal(result.documents[0].title, 'Pedido de juntada');
  assert.equal(result.documents[0].docId, 'titulo-1');
  assert.equal(result.documents[1].docId, 'titulo-2');
  assert.equal(result.documents[2].title, 'Sentença');
});

test('placeholder bodies become imagem/sem texto gaps and stay out of the pack text', () => {
  const text = [
    'Id 1001',
    'Laudo',
    '',
    '[imagem]',
    '',
    'Id 1002',
    'Certidão',
    '',
    'documento digitalizado',
    '',
    'Id 1003',
    'Despacho',
    '',
    BODY,
  ].join('\n');
  const result = segmentText(text);
  const gaps = result.gaps.filter((gap) => gap.reason === 'image_no_text');
  assert.equal(gaps.length, 2);
  assert.equal(gaps.every((gap) => gap.detail === TEXT_RULES.placeholder.detail), true);
  assert.deepEqual(gaps.map((gap) => gap.docId), ['1001', '1002']);
  const pack = buildCasePack(result);
  assert.match(pack, /imagem\/sem texto/);
  assert.doesNotMatch(pack, /\[imagem\]/);
  assert.match(pack, /\[ID 1003, pág\. 1\]/);
  assert.match(pack, new RegExp(BODY));
});

test('fallback_sem_id cuts unmarked prose into numbered blocks', () => {
  const text = `${'palavra '.repeat(800)}fim`;
  assert.ok(text.length > TEXT_BLOCK_CHARS);
  const result = segmentText(text);
  assert.deepEqual(result.rules, [TEXT_RULES.fallbackSemId.id]);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].docId, TEXT_RULES.fallbackSemId.docId);
  assert.ok(result.pages.length >= 2);
  assert.deepEqual(result.pages.map((page) => page.pageInDoc), result.pages.map((_, index) => index + 1));
  assert.ok(result.pages.every((page) => page.text.length <= TEXT_BLOCK_CHARS));
  assert.equal(result.pages.map((page) => page.text).join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
});

test('an empty export is a gap and does not throw', () => {
  const result = segmentText('   \n');
  assert.equal(result.documents.length, 0);
  assert.equal(result.gaps[0].reason, 'empty_text');
});

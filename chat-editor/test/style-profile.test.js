// G5: a style profile steers the draft. The scorer must give a draft written in a profile's form
// a high score on that profile and a low one on a clearly different profile. Synthetic only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { looExamples, parseDraft, scoreDraft, styleBlock } from '../src/style-profile.js';

const load = (id) => JSON.parse(readFileSync(new URL(`../profiles/${id}.json`, import.meta.url)));
const DEF = load('default-jef-v1');
const PROSA = load('synthetic-prosa');
const SECOES = load('synthetic-secoes');

const JEF = [
  'PREVIDENCIÁRIO. AUXÍLIO POR INCAPACIDADE TEMPORÁRIA. PERÍCIA DESFAVORÁVEL. LAUDO FUNDAMENTADO. SENTENÇA MANTIDA. RECURSO DESPROVIDO.',
  '',
  '1. Trata-se de recurso inominado interposto pela parte autora contra sentença que julgou improcedente o pedido de auxílio por incapacidade temporária.',
  '2. A recorrente sustenta, em síntese, que os atestados particulares demonstram a incapacidade e pede nova perícia.',
  '3. A perícia judicial, realizada em 05/05/2025, diagnosticou lombalgia (CID M54.5) e concluiu pela capacidade laboral [Id 9999, fl. 2].',
  '4. O laudo oficial está bem fundamentado e não foi infirmado por prova capaz de afastar suas conclusões.',
  '5. Recurso conhecido e desprovido. Sentença mantida por seus próprios fundamentos.',
  '6. Condeno a parte recorrente ao pagamento de honorários advocatícios de 10% sobre o valor corrigido da causa, suspensa a exigibilidade em razão da gratuidade da justiça.',
].join('\n');

test('each synthetic profile example scores full marks on its own profile', () => {
  for (const p of [PROSA, SECOES]) {
    const outcomes = p === SECOES ? ['desprovido', 'provido'] : ['desprovido', 'desprovido'];
    p.examples.forEach((e, i) => assert.equal(scoreDraft(e.text, p, outcomes[i]).score, 1, `${p.id} example ${i}`));
  }
});

test('a JEF-V1 draft scores full on the default profile and low on the others', () => {
  assert.equal(scoreDraft(JEF, DEF, 'desprovido').score, 1);
  assert.ok(scoreDraft(JEF, PROSA, 'desprovido').score < 0.5);
  assert.ok(scoreDraft(JEF, SECOES, 'desprovido').score < 0.5);
});

test('profiles are told apart: own score beats every other profile by at least 0.4', () => {
  for (const [p, i, outcome] of [[PROSA, 0, 'desprovido'], [SECOES, 0, 'desprovido']]) {
    const text = p.examples[i].text;
    const own = scoreDraft(text, p, outcome).score;
    for (const q of [DEF, PROSA, SECOES].filter((q) => q !== p)) assert.ok(own - scoreDraft(text, q, outcome).score >= 0.4, `${p.id} vs ${q.id}`);
  }
});

test('outcome matters: a desprovido closing fails a provido check', () => {
  const r = scoreDraft(JEF, DEF, 'provido');
  const failed = r.checks.filter((c) => !c.ok).map((c) => c.id);
  assert.ok(failed.includes('closing') && failed.includes('ementa_result') && failed.includes('fees'));
});

test('parcial ementa does not count as provido', () => {
  const t = JEF.replace('RECURSO DESPROVIDO.', 'RECURSO PARCIALMENTE PROVIDO.');
  assert.equal(scoreDraft(t, DEF, 'provido').checks.find((c) => c.id === 'ementa_result').ok, false);
  assert.equal(scoreDraft(t, DEF, 'parcial').checks.find((c) => c.id === 'ementa_result').ok, true);
});

test('numbering out of order and bold body text fail', () => {
  const t = JEF.replace('3. A perícia', '7. A perícia').replace('O laudo oficial', '**O laudo oficial está bem**');
  const failed = scoreDraft(t, DEF, 'desprovido').checks.filter((c) => !c.ok).map((c) => c.id);
  assert.ok(failed.includes('body_layout') && failed.includes('forbid'));
});

test('the score carries no draft text', () => {
  const r = scoreDraft(JEF, DEF, 'desprovido');
  assert.ok(!JSON.stringify(r).includes('lombalgia'));
  assert.throws(() => scoreDraft(JEF, DEF, 'talvez'), TypeError);
});

test('leave-one-out never returns the held-out case and prefers the same topic', () => {
  const ex = [{ label: 'a', topic: 'x', text: '1' }, { label: 'b', topic: 'y', text: '2' }, { label: 'c', topic: 'x', text: '3' }, { label: 'd', topic: 'y', text: '4' }];
  const got = looExamples(ex, 'a', 'x', 2).map((e) => e.label);
  assert.deepEqual(got, ['c', 'b']);
});

test('style block keeps only instructions and example text', () => {
  const b = styleBlock(PROSA);
  assert.equal(b.examples.length, 2);
  assert.deepEqual(Object.keys(b.examples[0]), ['text']);
  assert.match(b.use, /not case evidence/);
  assert.ok(parseDraft('a\n\n**b**').blocks.includes('b'));
});

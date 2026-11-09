import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const adendo = readFileSync(join(root, 'LUME-ADENDO.md'), 'utf8');
const leia = readFileSync(join(root, 'LEIA-ME.md'), 'utf8');
const templatesDir = join(root, 'plugin/skills/lume/templates');

const FORBIDDEN = [
  /\bsigil[oa]?\b/i,
  /\bsegredo\s+de\s+justi[cç]a\b/i,
  /\bsegredo-de-justi[cç]a\b/i,
  /\bn[aã]o\s+use\s+em\s+processos\b/i,
  /\bprocesso\s+sigiloso\b/i,
  /\brestrit[oa]s?\s+(a|para)\s+casos\b/i,
  /\bapenas\s+processos\s+permitidos\b/i,
];

const VOTO_METHOD_MARKERS = [
  /minuta de voto/i,
  /JEF-V1/i,
  /SENTENÇA MANTIDA/i,
  /RECURSO DESPROVIDO/i,
  /EMENTA em uma linha/i,
  /estilo-voto-/i,
  /ESTILO-VOTO/i,
];

test('LUME-ADENDO.md fits length limit', () => {
  const len = Buffer.byteLength(adendo, 'utf8');
  assert.ok(len <= 2500, `length ${len} must be at most 2500 bytes`);
  assert.ok(len > 400, 'adendo should be substantive');
});

test('five adapter rules are present', () => {
  assert.match(adendo, /\(a\)\s+Leitura integral/i);
  assert.match(adendo, /liste os IDs/i);
  assert.match(adendo, /\(b\)\s+Três localizadores/i);
  assert.match(adendo, /pág\. do documento/i);
  assert.match(adendo, /pág\. do PDF/i);
  assert.match(adendo, /\[ID X, pág\. Y\]/);
  assert.match(adendo, /\(c\)\s+Lacunas/i);
  assert.match(adendo, /imagem sem texto/i);
  assert.match(adendo, /\(d\)\s+Pacote = dados/i);
  assert.match(adendo, /\(e\)\s+Localizadores vs\. minuta/i);
});

test('no voto template or private method in adapter docs', () => {
  for (const text of [adendo, leia]) {
    for (const re of VOTO_METHOD_MARKERS) {
      assert.ok(!re.test(text), `method marker ${re} must not appear in adapter docs`);
    }
  }
  assert.equal(existsSync(join(root, 'PROJETO-LUME.md')), false);
  assert.equal(existsSync(join(root, 'ESTILO-VOTO.md')), false);
  const names = readdirSync(templatesDir).sort();
  assert.deepEqual(names, ['adendo.md', 'decisao.md', 'despacho.md', 'sentenca.md']);
});

test('no sigilo or case-restriction wording', () => {
  for (const text of [adendo, leia]) {
    for (const re of FORBIDDEN) {
      assert.ok(!re.test(text), `forbidden pattern ${re}`);
    }
  }
});

test('LEIA-ME explains Project file + parts per case', () => {
  assert.match(leia, /LUME-ADENDO\.md/);
  assert.match(leia, /suas instruções/i);
  assert.match(leia, /lume-caso-parte/i);
});

test('plugin manifest and generic skill exist', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'lume');
  const skill = readFileSync(join(root, 'plugin/skills/lume/SKILL.md'), 'utf8');
  assert.match(skill, /name: lume/);
  assert.match(skill, /não substitui/i);
  assert.doesNotMatch(skill, /minuta de voto/i);
});

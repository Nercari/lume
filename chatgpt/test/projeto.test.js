import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projeto = readFileSync(join(root, 'PROJETO-LUME.md'), 'utf8');
const leia = readFileSync(join(root, 'LEIA-ME.md'), 'utf8');
const estiloLeia = readFileSync(join(root, 'ESTILO-LEIA-ME.md'), 'utf8');
const estiloVoto = readFileSync(join(root, 'ESTILO-VOTO.md'), 'utf8');
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

const ESTILO_MARKERS = [
  /SENTENÇA MANTIDA/,
  /SENTENÇA REFORMADA/,
  /RECURSO DESPROVIDO/,
  /RECURSO PROVIDO/,
  /§1 — recurso e sentença/,
  /idade, escolaridade/,
  /Rejeito a preliminar de/,
  /Não há cerceamento de defesa/,
  /pondera/,
  /requisito por requisito/,
  /laudo oficial encontra-se bem fundamentado/i,
  /Ausente o requisito/,
  /Recurso conhecido e desprovido/,
  /honorários advocatícios de 10%/,
  /art\. 55 da Lei 9\.099\/1995/,
  /Turma Recursal/,
];

test('PROJETO-LUME.md fits ChatGPT project instructions limit', () => {
  const len = Buffer.byteLength(projeto, 'utf8');
  assert.ok(len <= 8000, `length ${len} must be at most 8000 bytes`);
  assert.ok(len > 1500, 'instructions should be substantive');
});

test('full-study rule and compact voto style summary are present', () => {
  assert.match(projeto, /Li as N partes/i);
  assert.match(projeto, /estudo integral/i);
  assert.match(projeto, /partes 1 a N/i);
  assert.match(projeto, /Ids das lacunas/i);
  assert.match(projeto, /índice mestre/i);
  assert.match(projeto, /ESTILO-VOTO\.md/);
  assert.match(projeto, /minuta de voto/i);
  assert.match(projeto, /SENTENÇA MANTIDA/);
  assert.match(projeto, /RECURSO \(DES\)PROVIDO/);
  assert.match(projeto, /Rejeito a preliminar/);
  assert.match(projeto, /Recurso conhecido e/);
  assert.match(projeto, /art\. 55 Lei 9\.099\/1995/);
  assert.match(projeto, /Estilo do Pedro/i);
  assert.match(projeto, /estilo-voto-/);
});

test('ESTILO-VOTO.md guide contains required structure markers', () => {
  for (const re of ESTILO_MARKERS) {
    assert.match(estiloVoto, re, `missing marker ${re}`);
  }
  assert.match(estiloVoto, /\[Id X, fl\. Y\]/);
  const pluginCopy = readFileSync(join(templatesDir, 'estilo-voto.md'), 'utf8');
  assert.equal(pluginCopy, estiloVoto);
});

test('citation format and piece templates are present', () => {
  assert.match(projeto, /\[Id X, fl\. Y\]/);
  const names = readdirSync(templatesDir).sort();
  assert.deepEqual(names, ['decisao.md', 'despacho.md', 'estilo-voto.md', 'sentenca.md', 'voto.md']);
  for (const name of names) {
    const body = readFileSync(join(templatesDir, name), 'utf8');
    if (name === 'estilo-voto.md') continue;
    assert.match(body, /\[Id X, fl\. Y\]/);
  }
  assert.match(projeto, /Sentença/i);
  assert.match(projeto, /decisão interlocutória/i);
  assert.match(projeto, /despacho/i);
  assert.match(projeto, /conferir citações/);
  assert.match(projeto, /resumo do processo/);
});

test('LEIA-ME points to ESTILO-VOTO.md upload', () => {
  assert.match(leia, /ESTILO-VOTO\.md/);
  assert.match(estiloLeia, /ESTILO-VOTO\.md/);
  assert.match(estiloLeia, /estilo-voto-/);
});

test('no sigilo or case-restriction wording in chatgpt staff docs', () => {
  for (const text of [projeto, leia, estiloLeia, estiloVoto]) {
    for (const re of FORBIDDEN) {
      assert.ok(!re.test(text), `forbidden pattern ${re}`);
    }
  }
});

test('plugin manifest and skill exist', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'lume');
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  const skill = readFileSync(join(root, 'plugin/skills/lume/SKILL.md'), 'utf8');
  assert.match(skill, /name: lume/);
  assert.match(skill, /estudo integral/i);
  assert.match(skill, /ESTILO-VOTO/);
});

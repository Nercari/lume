import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projeto = readFileSync(join(root, 'PROJETO-LUME.md'), 'utf8');
const leia = readFileSync(join(root, 'LEIA-ME.md'), 'utf8');
const estilo = readFileSync(join(root, 'ESTILO-LEIA-ME.md'), 'utf8');
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

test('PROJETO-LUME.md fits ChatGPT project instructions limit', () => {
  const len = Buffer.byteLength(projeto, 'utf8');
  assert.ok(len <= 8000, `length ${len} must be at most 8000 bytes`);
  assert.ok(len > 1500, 'instructions should be substantive');
});

test('full-study rule and voto primary template are present', () => {
  assert.match(projeto, /Li as N partes/i);
  assert.match(projeto, /estudo integral/i);
  assert.match(projeto, /parte.*1 a N/i);
  assert.match(projeto, /Ids das peças/i);
  assert.match(projeto, /Ids das lacunas/i);
  assert.match(projeto, /índice mestre/i);
  assert.match(projeto, /minuta de voto/i);
  assert.match(projeto, /EMENTA/);
  assert.match(projeto, /FUNDAMENTAÇÃO/);
  assert.match(projeto, /DISPOSITIVO/);
  assert.match(projeto, /art\. 38 da Lei 9\.099\/1995/);
  assert.match(projeto, /Estilo do Pedro/i);
  assert.match(projeto, /estilo-voto-/);
});

test('citation format and piece templates are present', () => {
  assert.match(projeto, /\[Id X, fl\. Y\]/);
  const names = readdirSync(templatesDir).sort();
  assert.deepEqual(names, ['decisao.md', 'despacho.md', 'sentenca.md', 'voto.md']);
  for (const name of names) {
    const body = readFileSync(join(templatesDir, name), 'utf8');
    assert.match(body, /\[Id X, fl\. Y\]/);
  }
  assert.match(projeto, /Sentença/);
  assert.match(projeto, /Decisão interlocutória/);
  assert.match(projeto, /Despacho/);
  assert.match(projeto, /conferir citações/);
  assert.match(projeto, /resumo do processo/);
});

test('no sigilo or case-restriction wording in chatgpt staff docs', () => {
  for (const text of [projeto, leia, estilo]) {
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
});

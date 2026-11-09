import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const projeto = readFileSync(join(root, 'PROJETO-LUME.md'), 'utf8');
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

test('PROJETO-LUME.md fits ChatGPT project instructions limit', () => {
  const len = Buffer.byteLength(projeto, 'utf8');
  assert.ok(len < 7500, `length ${len} must be under 7500 bytes`);
  assert.ok(len > 1500, 'instructions should be substantive');
});

test('citation format and piece templates are present', () => {
  assert.match(projeto, /\[Id\s+<docId>,\s*fl\.\s*<n>\]/);
  assert.match(projeto, /\[Id\s+X,\s*fl\.\s*Y\]/);
  const names = readdirSync(templatesDir).sort();
  assert.deepEqual(names, ['decisao.md', 'despacho.md', 'sentenca.md']);
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
  for (const text of [projeto, leia]) {
    for (const re of FORBIDDEN) {
      assert.ok(!re.test(text), `forbidden pattern ${re}`);
    }
  }
});

test('plugin manifest and skill exist', () => {
  const manifest = JSON.parse(readFileSync(join(root, 'plugin/plugin.json'), 'utf8'));
  assert.equal(manifest.name, 'lume');
  assert.equal(manifest.$schema, 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json');
  assert.ok(readFileSync(join(root, 'plugin/skills/lume/SKILL.md'), 'utf8').includes('name: lume'));
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintText, lintJson } from '../src/lint-public.mjs';

// Samples are joined at runtime so this file itself passes the linter.
const j = (...p) => p.join('');
const kinds = (t) => lintText(t).map((x) => x.kind);

test('catches a CNJ case number, formatted and bare', () => {
  assert.deepEqual(kinds(j('Proc. ', '0001234', '-56.2026', '.4.01.3400')), ['cnj-case-number']);
  assert.ok(kinds(j('0001234', '5620264013400')).includes('cnj-case-number'));
});

test('catches CPF and CNPJ', () => {
  assert.deepEqual(kinds(j('CPF ', '123.456', '.789-09')), ['cpf']);
  assert.deepEqual(kinds(j('CNPJ ', '12.345.678', '/0001-95')), ['cnpj']);
  assert.deepEqual(kinds(j('id ', '12345', '678909')), ['cpf']);
});

test('catches an email', () => assert.deepEqual(kinds(j('contact ', 'someone', '@', 'example.org')), ['email']));

test('allows non-identifying text', () => {
  assert.deepEqual(lintText('case-synth01 scored 3 on gaps; Res. 615/2025 art. 19; 1,000 pages; 2026-11-09'), []);
});

test('reports line numbers, not the matched text', () => {
  const r = lintText(j('ok\n', 'x ', '123.456', '.789-09'));
  assert.deepEqual(r, [{ line: 2, kind: 'cpf' }]);
});

test('catches names in JSON fields', () => {
  const r = lintJson({ cases: [{ id: 'case-synth01', party_name: 'Someone' }, { autor: 'Someone' }] });
  assert.deepEqual(r.map((x) => x.path), ['/cases/0/party_name', '/cases/1/autor']);
  assert.deepEqual(lintJson({ id: 'case-synth01', reviewer: 'rev-synth01' }), []);
});

test('CLI fails on a bad file and never prints the match', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lint-'));
  const secret = j('987.654', '.321-00');
  writeFileSync(join(dir, 'note.md'), `summary\n${secret}\n`);
  const r = spawnSync('node', ['src/lint-public.mjs', dir], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /note\.md:2: cpf/);
  assert.ok(!r.stderr.includes(secret) && !r.stdout.includes(secret));
});

test('the committed intake files are clean', () => {
  const r = spawnSync('node', ['src/lint-public.mjs', 'docs', 'schema', 'src', 'test', 'package.json'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
});

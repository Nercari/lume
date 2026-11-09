import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { validateManifest } from '../src/manifest.mjs';

const valid = () => JSON.parse(readFileSync(new URL('./fixtures/valid-manifest.json', import.meta.url)));
const has = (errors, text) => assert.ok(errors.some((e) => e.includes(text)), `expected "${text}" in:\n${errors.join('\n')}`);

test('valid synthetic manifest passes', () => assert.deepEqual(validateManifest(valid()), []));

test('fewer than 5 cases fails', () => {
  const m = valid(); m.cases.pop();
  has(validateManifest(m), 'at least 5 items');
});

test('long-record needs 1000 pages', () => {
  const m = valid(); m.cases[0].page_count = 999; m.cases[0].annotation.inventory[0].pages = 899;
  has(validateManifest(m), 'long-record needs page_count >= 1000');
});

test('every slice must be covered or pending', () => {
  const m = valid(); m.pending_slices = [];
  has(validateManifest(m), 'slice late-decisive-evidence must be covered');
});

test('a slice cannot be both covered and pending', () => {
  const m = valid(); m.pending_slices.push({ slice: 'scans', reason: 'x' });
  has(validateManifest(m), 'scans is covered by a case and also pending');
});

test('needs tuning and held-out unless split_exception', () => {
  const m = valid(); m.cases.forEach((c) => (c.split = 'held-out'));
  has(validateManifest(m), 'split_exception');
  m.split_exception = 'Only held-out cases were supplied';
  assert.deepEqual(validateManifest(m), []);
});

test('case identity must be opaque', () => {
  const m = valid(); m.cases[0].id = 'Case of a named party';
  has(validateManifest(m), '/cases/0/id: does not match');
});

test('annotations must be done before evaluation and cite the inventory', () => {
  const m = valid();
  m.cases[1].annotation.completed_before_evaluation = false;
  assert.ok(validateManifest(m).length > 0);
  const n = valid();
  n.cases[1].annotation.decisive_facts[0].sources[0] = { doc: 'doc-999', page: 1 };
  has(validateManifest(n), 'doc not in inventory');
  const p = valid();
  p.cases[1].annotation.decisive_facts[0].sources[0].page = 31;
  has(validateManifest(p), 'page beyond document');
});

test('inventory pages must equal page_count', () => {
  const m = valid(); m.cases[4].page_count = 9;
  has(validateManifest(m), 'inventory pages (8) must equal page_count (9)');
});

test('slice evidence is checked', () => {
  const m = valid(); m.cases[1].annotation.contradictions = [];
  has(validateManifest(m), 'contradictions slice needs');
  const n = valid(); delete n.cases[2].annotation.inventory[1].added_late;
  has(validateManifest(n), 'inventory-change slice needs');
});

test('unknown fields are rejected and errors do not echo values', () => {
  const m = valid(); m.cases[0].party_name = 'SECRETVALUE';
  const errors = validateManifest(m);
  has(errors, 'unknown property');
  m.cases[0].id = 'SECRETVALUE';
  assert.ok(!validateManifest(m).join('\n').includes('SECRETVALUE'));
});

test('CLI exit codes', () => {
  const ok = execFileSync('node', ['src/manifest.mjs', 'test/fixtures/valid-manifest.json'], { encoding: 'utf8' });
  assert.match(ok, /ok: 5 cases/);
  const bad = spawnSync('node', ['src/manifest.mjs', 'test/fixtures/invalid-manifest.json'], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
});

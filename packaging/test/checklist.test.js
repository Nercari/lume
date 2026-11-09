import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const required = JSON.parse(readFileSync(join(root, 'fixtures/required-checklist.json'), 'utf8'));

test('observer checklist lists required sections and BLOCKED live status', () => {
  const text = readFileSync(join(root, 'docs/observer-checklist.md'), 'utf8');
  assert.match(text, /BLOCKED/, 'live study must be marked BLOCKED');
  for (const section of required.observerSections) {
    const h = section === 'Study status' ? '## Study status' : `## ${section}`;
    assert.ok(text.includes(h), `missing observer section: ${section}`);
  }
});

test('user guide lists required sections', () => {
  const text = readFileSync(join(root, 'docs/user-guide.md'), 'utf8');
  for (const section of required.userGuideSections) {
    assert.ok(text.includes(`## ${section}`), `missing user guide section: ${section}`);
  }
});

test('attribution checklist covers required items', () => {
  const text = readFileSync(join(root, 'docs/attribution-checklist.md'), 'utf8');
  for (const item of required.attributionItems) {
    assert.ok(text.includes(item), `attribution missing: ${item}`);
  }
});

test('revoke-uninstall spec documents asserts R1–D4', () => {
  const text = readFileSync(join(root, 'docs/revoke-uninstall-spec.md'), 'utf8');
  for (const id of ['R1', 'R2', 'R3', 'D1', 'D2', 'D3']) {
    assert.ok(text.includes(`**Assert ${id}`), id);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const docsDir = join(dirname(fileURLToPath(import.meta.url)), '../docs');
const guiasDir = join(dirname(fileURLToPath(import.meta.url)), '../guias');

const GUIDE_FILES = ['user-guide.md', 'permissions-and-limits.md', 'package-layout.md', 'observer-checklist.md'];
const STAFF_GUIDE_PATHS = [...GUIDE_FILES.map((f) => join(docsDir, f)), join(guiasDir, 'LEIA-ME-PRIMEIRO.md')];

const PASTE_TOKEN = /paste\s+(your\s+)?(token|api\s*key|refresh)/i;
const FORBIDDEN = [
  /\bOPENAI_API_KEY\b/,
  /\bsk-[A-Za-z0-9]{8,}/,
  /billing\s+fallback/i,
  /x-api-key/i,
];

const PAID_CREDITS = /paid\s+api\s+credits?/i;
const ENABLE_PAID = /enable\s+paid/i;

const BYOK = /bring\s+your\s+own\s+api\s+key/i;

function lineInstructsForbidden(line, re) {
  if (!re.test(line)) return false;
  return !/(never|do not|does not|must not|without|no alternate|not offer|not silently|does \*\*not\*\*)/i.test(line);
}

const REQUIRED_SAFE = [/does \*\*not\*\* offer a paid API key/i, /never paste tokens/i];

test('staff-facing guides forbid token paste and paid fallback instructions', () => {
  for (const path of STAFF_GUIDE_PATHS) {
    const file = path.endsWith('LEIA-ME-PRIMEIRO.md') ? 'LEIA-ME-PRIMEIRO.md' : path.split('/').pop();
    const text = readFileSync(path, 'utf8');
    for (const line of text.split('\n')) {
      assert.ok(!lineInstructsForbidden(line, PASTE_TOKEN), `${file} instructs token paste: ${line.trim()}`);
      assert.ok(!lineInstructsForbidden(line, BYOK), `${file} instructs BYOK: ${line.trim()}`);
      assert.ok(!lineInstructsForbidden(line, PAID_CREDITS), `${file} instructs paid credits: ${line.trim()}`);
      assert.ok(!lineInstructsForbidden(line, ENABLE_PAID), `${file} enables paid path: ${line.trim()}`);
    }
    for (const re of FORBIDDEN) {
      assert.ok(!re.test(text), `${file} must not match ${re}`);
    }
  }
  const user = readFileSync(join(docsDir, 'user-guide.md'), 'utf8');
  for (const re of REQUIRED_SAFE) {
    assert.ok(re.test(user), `user-guide.md should state safety: ${re}`);
  }
});

test('all packaging docs exist and are non-empty', () => {
  const names = readdirSync(docsDir).filter((f) => f.endsWith('.md'));
  assert.ok(names.length >= 7, names.join(', '));
  for (const n of names) {
    const body = readFileSync(join(docsDir, n), 'utf8').trim();
    assert.ok(body.length > 200, `${n} too short`);
  }
});

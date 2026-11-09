import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

function filesUnder(dir, rel = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    const child = rel ? join(rel, name) : name;
    if (statSync(abs).isDirectory()) out.push(...filesUnder(abs, child));
    else out.push(child);
  }
  return out;
}

test('build emits a loadable unpacked extension with only the documented permissions', () => {
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs')]);
  const m = JSON.parse(readFileSync(join(root, 'dist/manifest.json'), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ['sidePanel', 'storage']);
  assert.equal(m.host_permissions, undefined);
  assert.equal(m.optional_permissions, undefined);
  assert.equal(m.web_accessible_resources, undefined);
  assert.equal(m.externally_connectable, undefined);
  assert.ok(m.key?.startsWith('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA'));
  assert.deepEqual(m.content_scripts.map((c) => c.matches), [['https://pje1g.trf1.jus.br/*', 'https://pje2g.trf1.jus.br/*']]);
  for (const rel of filesUnder(join(root, 'src'))) {
    if (rel === 'content.js') continue;
    assert.ok(existsSync(join(root, 'dist', rel)), rel);
  }
  assert.ok(existsSync(join(root, 'dist/pages/README.md')));
  const content = readFileSync(join(root, 'dist/content.js'), 'utf8');
  assert.ok(!/^\s*(import|export)\b/m.test(content), 'content script is a classic script');
  assert.match(content, /function createTracker/);
  assert.match(content, /function snapshotDocument/);
  assert.match(content, /function validateStoredProfile/);
});

test('source never touches credentials, cookies, certificates or navigation', () => {
  const forbidden = /document\.cookie|chrome\.cookies|credentials:\s*['"]include|localStorage|location\.(assign|replace|reload)|location\.href\s*=|window\.open|\.click\(|\.submit\(|chrome\.debugger|webRequest|setInterval/;
  for (const rel of filesUnder(join(root, 'src'))) {
    const lines = readFileSync(join(root, 'src', rel), 'utf8').split('\n');
    lines.forEach((line, i) => assert.ok(!forbidden.test(line), `${rel}:${i + 1} uses a forbidden API`));
  }
});

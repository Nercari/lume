import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

test('build emits a loadable unpacked extension with only the documented permissions', () => {
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs')]);
  const m = JSON.parse(readFileSync(join(root, 'dist/manifest.json'), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ['sidePanel']);
  assert.equal(m.host_permissions, undefined);
  assert.equal(m.optional_permissions, undefined);
  assert.equal(m.web_accessible_resources, undefined);
  assert.equal(m.externally_connectable, undefined);
  assert.deepEqual(m.content_scripts.map((c) => c.matches), [['https://pje1g.trf1.jus.br/pje/*']]);
  for (const f of ['manifest.json', 'worker.js', 'content.js', 'panel.html', 'panel.js', 'core.js']) assert.ok(existsSync(join(root, 'dist', f)), f);
  const content = readFileSync(join(root, 'dist/content.js'), 'utf8');
  assert.ok(!/^\s*(import|export)\b/m.test(content), 'content script is a classic script');
  assert.match(content, /function createTracker/);
});

test('source never touches credentials, cookies, certificates or navigation', () => {
  const forbidden = /document\.cookie|chrome\.cookies|credentials:\s*['"]include|localStorage|location\.(assign|replace|reload)|location\.href\s*=|window\.open|\.click\(|\.submit\(|chrome\.debugger|webRequest|setInterval/;
  for (const f of readdirSync(join(root, 'src'))) {
    const lines = readFileSync(join(root, 'src', f), 'utf8').split('\n');
    lines.forEach((l, i) => assert.ok(!forbidden.test(l), `${f}:${i + 1} uses a forbidden API`));
  }
});

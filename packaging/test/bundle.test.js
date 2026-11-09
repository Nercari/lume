import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { assertBundlePathAllowed, MAX_BUNDLE_BYTES } from '../scripts/bundle-guards.mjs';

const packaging = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(packaging, '..');
const bundleScript = join(packaging, 'scripts/bundle.mjs');

function walkFiles(dir, base = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const rel = base ? `${base}/${name}` : name;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) out.push(...walkFiles(p, rel));
    else out.push(rel);
  }
  return out;
}

test('bundle guards refuse pdf, private paths, calibration exports, and huge files', () => {
  assert.throws(() => assertBundlePathAllowed('docs/segredo.pdf', 1), /refused blocked/);
  assert.throws(() => assertBundlePathAllowed('private/x.txt', 1), /refused blocked/);
  assert.throws(() => assertBundlePathAllowed('lume-calibracao-2026.json', 1), /refused blocked/);
  assert.throws(() => assertBundlePathAllowed('eval/private-eval-run/out.json', 1), /refused blocked/);
  assert.throws(() => assertBundlePathAllowed('big.bin', MAX_BUNDLE_BYTES + 1), /50 MB/);
  assert.doesNotThrow(() => assertBundlePathAllowed('extension/manifest.json', 100));
});

test('bundle.mjs assembles lume-install tree with manifest and without pdf', () => {
  execFileSync('npm', ['--prefix', join(repo, 'extension'), 'run', 'build'], { stdio: 'pipe' });
  const out = mkdtempSync(join(tmpdir(), 'lume-bundle-'));
  execFileSync(process.execPath, [bundleScript, '--out', out], { stdio: 'pipe' });

  const files = walkFiles(out);
  assert.ok(files.some((f) => f === 'extension/manifest.json'));
  assert.ok(files.some((f) => f === 'guias/LEIA-ME-PRIMEIRO.md'));
  assert.ok(files.some((f) => f === 'windows/instalar.ps1'));
  assert.ok(files.some((f) => f === 'MANIFEST.txt'));
  assert.ok(files.some((f) => f === 'RELEASE-PIN.txt'));
  assert.ok(!files.some((f) => f.toLowerCase().endsWith('.pdf')));

  const manifestBody = readFileSync(join(out, 'MANIFEST.txt'), 'utf8');
  assert.match(manifestBody, /extension\/manifest\.json\t[0-9a-f]{64}\t\d+/);
});

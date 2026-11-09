import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { assertBundlePathAllowed, MAX_BUNDLE_BYTES } from '../scripts/bundle-guards.mjs';
import { archiveBundleDir, ZIP_SKIP_MESSAGE } from '../scripts/bundle-zip.mjs';

const packaging = join(dirname(fileURLToPath(import.meta.url)), '..');
const repo = join(packaging, '..');
const bundleScript = join(packaging, 'scripts/bundle.mjs');

const EXPECTED_TOP = ['chatgpt', 'extension', 'guias', 'it', 'LICENSES', 'windows'];

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

test('bundle guards refuse pdf, private paths, calibration exports, runtime, and huge files', () => {
  assert.throws(() => assertBundlePathAllowed('docs/segredo.pdf', 1), /refused blocked/);
  assert.throws(() => assertBundlePathAllowed('private/x.txt', 1), /refused blocked/);
  assert.throws(() => assertBundlePathAllowed('lume-calibracao-2026.json', 1), /refused blocked/);
  assert.throws(() => assertBundlePathAllowed('eval/private-eval-run/out.json', 1), /refused blocked/);
  assert.throws(() => assertBundlePathAllowed('runtime/node/node.exe', 1), /refused blocked/);
  assert.throws(() => assertBundlePathAllowed('big.bin', MAX_BUNDLE_BYTES + 1), /50 MB/);
  assert.doesNotThrow(() => assertBundlePathAllowed('extension/manifest.json', 100));
});

test('bundle.mjs assembles Windows install tree with manifest and without pdf or runtime', () => {
  execFileSync('npm', ['--prefix', join(repo, 'extension'), 'run', 'build'], { stdio: 'pipe' });
  const out = mkdtempSync(join(tmpdir(), 'lume-bundle-'));
  execFileSync(process.execPath, [bundleScript, '--out', out], { stdio: 'pipe' });

  const dirs = readdirSync(out).filter((name) => statSync(join(out, name)).isDirectory()).sort();
  assert.deepEqual(dirs, EXPECTED_TOP);
  assert.ok(top.includes('MANIFEST.txt'));
  assert.ok(!existsSync(join(out, 'RELEASE-PIN.txt')));
  assert.ok(!existsSync(join(out, 'runtime')));
  assert.ok(!existsSync(join(out, 'manual')));
  assert.ok(!existsSync(join(out, 'macos')));
  assert.ok(!existsSync(join(out, 'linux')));

  const files = walkFiles(out);
  assert.ok(files.some((f) => f === 'extension/manifest.json'));
  assert.ok(files.some((f) => f === 'extension/manual/lume-pdf.html'));
  assert.ok(files.some((f) => f === 'guias/LEIA-ME-PRIMEIRO.md'));
  assert.ok(files.some((f) => f === 'guias/user-guide.md'));
  assert.ok(files.some((f) => f === 'guias/permissions-and-limits.md'));
  assert.ok(files.some((f) => f === 'windows/instalar.ps1'));
  assert.ok(files.some((f) => f === 'chatgpt/PROJETO-LUME.md'));
  assert.ok(files.some((f) => f === 'chatgpt/LEIA-ME.md'));
  assert.ok(files.some((f) => f.startsWith('chatgpt/plugin/')));
  assert.ok(!files.some((f) => f.startsWith('comp' + 'anion/')));
  assert.ok(!files.some((f) => f.toLowerCase().endsWith('.pdf')));

  const manifestBody = readFileSync(join(out, 'MANIFEST.txt'), 'utf8');
  assert.match(manifestBody, /^# commit=[0-9a-f]+\n/m);
  assert.match(manifestBody, /^# extension_version=/m);
  assert.match(manifestBody, /extension\/manifest\.json\t[0-9a-f]{64}\t\d+/);
});

test('--zip writes an archive when zip CLI is available, otherwise reports skip', () => {
  execFileSync('npm', ['--prefix', join(repo, 'extension'), 'run', 'build'], { stdio: 'pipe' });
  const out = mkdtempSync(join(tmpdir(), 'lume-bundle-'));
  const zipPath = join(tmpdir(), `lume-install-${Date.now()}.zip`);
  const log = execFileSync(process.execPath, [bundleScript, '--out', out, '--zip', zipPath], {
    encoding: 'utf8',
  });
  const direct = archiveBundleDir(out, join(tmpdir(), `lume-zip-direct-${Date.now()}.zip`));
  if (direct.ok) {
    assert.ok(existsSync(zipPath), 'bundle --zip should create the archive when zip is available');
    assert.match(log, /zipped with/);
  } else {
    assert.match(log, /--zip skipped/);
    assert.equal(direct.message, ZIP_SKIP_MESSAGE);
  }
});

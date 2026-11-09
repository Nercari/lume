import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { access, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts/build.mjs')], { cwd: root });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

test('the page source stays local and in Portuguese', async () => {
  const html = await readFile(join(root, 'web/index.html'), 'utf8');
  const app = await readFile(join(root, 'web/app.js'), 'utf8');
  const ocr = await readFile(join(root, 'src/ocr.js'), 'utf8');
  for (const phrase of [
    'Tudo fica neste computador',
    'Baixar pacote do caso (.md)',
    'Copiar pacote',
    'Conferir citações',
    'OCR local nas páginas do PDF sem texto',
  ]) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.equal(html.includes('checked'), true);
  assert.doesNotMatch(html, /(?:src|href)="https?:/i);
  assert.doesNotMatch(`${html}\n${app}`, /sigilo|restrito|segredo de justi[cç]a/i);
  assert.match(html, /src="\.\/lume-pdf\.js"/);
  assert.match(app, /pdf\.worker\.mjs/);
  assert.match(app, /PACK_FILENAME/);
  assert.match(app, /OCR página/);
  assert.match(ocr, /workerBlobURL:\s*false/);
  assert.doesNotMatch(`${html}\n${app}\n${ocr}`, /api\.openai|sk-|BEGIN OPENAI|jsdelivr|unpkg/i);
});

test('build emits the page, the script and the worker', { timeout: 120_000 }, async () => {
  const { code, stderr } = await runBuild();
  assert.equal(code, 0, stderr);
  const html = await readFile(join(root, 'dist/lume-pdf.html'), 'utf8');
  const js = await readFile(join(root, 'dist/lume-pdf.js'), 'utf8');
  await access(join(root, 'dist/pdf.worker.mjs'));
  for (const file of [
    'ocr/worker.min.js',
    'ocr/tesseract-core-simd-lstm.wasm.js',
    'ocr/tesseract-core-lstm.wasm.js',
    'ocr/por.traineddata.gz',
  ]) {
    await access(join(root, 'dist', file));
  }
  assert.match(html, /src="\.\/lume-pdf\.js"/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/i);
  assert.match(js, /pdf\.worker\.mjs/);
  assert.match(js, /getDocument/);
  assert.match(js, /workerBlobURL:\s*false/);
  assert.match(js, /tesseract-core-simd-lstm\.wasm\.js/);
  assert.doesNotMatch(js, /cdn\.jsdelivr|unpkg\.com/i);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', join(root, 'dist/lume-pdf.js')]);
    child.on('error', reject);
    child.on('close', (status) => (status === 0 ? resolve() : reject(new Error(`syntax ${status}`))));
  });
});

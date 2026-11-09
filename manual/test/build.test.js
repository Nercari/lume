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
  for (const phrase of [
    'Tudo fica neste computador',
    'Copiar prompt',
    'Baixar arquivo do processo (.txt) para anexar no ChatGPT',
    'Verificar citações',
    'precisa OCR',
  ]) {
    assert.ok(html.includes(phrase), phrase);
  }
  assert.doesNotMatch(html, /(?:src|href)="https?:/i);
  assert.match(html, /src="\.\/lume-pdf\.js"/);
  assert.match(app, /pdf\.worker\.mjs/);
  assert.match(app, /processo\.txt/);
  assert.doesNotMatch(`${html}\n${app}`, /api\.openai|sk-|BEGIN OPENAI/i);
});

test('build emits the page, the script and the worker', { timeout: 120_000 }, async () => {
  const { code, stderr } = await runBuild();
  assert.equal(code, 0, stderr);
  const html = await readFile(join(root, 'dist/lume-pdf.html'), 'utf8');
  const js = await readFile(join(root, 'dist/lume-pdf.js'), 'utf8');
  await access(join(root, 'dist/pdf.worker.mjs'));
  assert.match(html, /src="\.\/lume-pdf\.js"/);
  assert.doesNotMatch(html, /(?:src|href)="https?:/i);
  assert.match(js, /pdf\.worker\.mjs/);
  assert.match(js, /getDocument/);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--check', join(root, 'dist/lume-pdf.js')]);
    child.on('error', reject);
    child.on('close', (status) => (status === 0 ? resolve() : reject(new Error(`syntax ${status}`))));
  });
});

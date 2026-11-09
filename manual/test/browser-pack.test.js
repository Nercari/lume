import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { makeImagePdf, renderWord } from './bitmap.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.wasm': 'application/wasm',
  '.gz': 'application/gzip',
};

function chromiumPath() {
  const candidates = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
  return candidates.find((path) => path && existsSync(path)) ?? null;
}

function serve(dir) {
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');
    const rel = normalize(decodeURIComponent(url.pathname).replace(/^\/+/, '')).replace(/^(\.\.(\/|\\|$))+/, '');
    const path = join(dir, rel === '' ? 'lume-pdf.html' : rel);
    if (!path.startsWith(dir)) {
      response.writeHead(403);
      response.end();
      return;
    }
    try {
      const body = await readFile(path);
      response.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'application/octet-stream' });
      response.end(body);
    } catch {
      response.writeHead(404);
      response.end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function runBuild() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(root, 'scripts/build.mjs')], { cwd: root });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(stderr || `build ${code}`))));
  });
}

test('headless Chromium OCRs an image-only PDF page into the case pack', { timeout: 180_000 }, async () => {
  await runBuild();
  const server = await serve(dist);
  const { port } = server.address();
  const executablePath = chromiumPath();
  const browser = await chromium.launch({ headless: true, executablePath: executablePath ?? undefined });
  const page = await browser.newPage();
  try {
    await page.goto(`http://127.0.0.1:${port}/lume-pdf.html`);
    // Scale 16 keeps the block "A" after pdf.js draws the image. Scale 12 is read as H.
    const pdf = makeImagePdf(renderWord('LAUDO', 16));
    await page.setInputFiles('#pdf', {
      name: 'autos.pdf',
      mimeType: 'application/pdf',
      buffer: pdf,
    });
    await page.waitForFunction(() => {
      const pack = document.querySelector('#pack');
      return pack && /LAUDO/.test(pack.value) && pack.value.includes('(texto por OCR, pode conter erros)');
    }, null, { timeout: 150_000 });
    const pack = await page.locator('#pack').inputValue();
    assert.match(pack, /\[ID pdfp1, pág\. 1\]/);
    assert.match(pack, /LAUDO/);
    assert.match(pack, /\(texto por OCR, pode conter erros\)/);
    assert.match(pack, /não têm texto recuperável; não invente/i);
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.click('#download'),
    ]);
    assert.equal(download.suggestedFilename(), 'lume-pacote-do-caso.md');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});

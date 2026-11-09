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

test('build emits a loadable unpacked extension with only the documented permissions', { timeout: 180_000 }, () => {
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
  const m = JSON.parse(readFileSync(join(root, 'dist/manifest.json'), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ['sidePanel', 'storage']);
  assert.equal(m.host_permissions, undefined);
  assert.equal(m.optional_permissions, undefined);
  assert.equal(m.optional_host_permissions, undefined);
  assert.equal(m.web_accessible_resources, undefined);
  assert.equal(m.externally_connectable, undefined);
  assert.ok(m.key?.startsWith('MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA'));
  assert.deepEqual(m.content_scripts.map((c) => c.matches), [
    ['https://pje1g.trf1.jus.br/*', 'https://pje2g.trf1.jus.br/*'],
  ]);
  const csp = m.content_security_policy.extension_pages;
  assert.equal(csp, "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");
  const tokens = csp.match(/'[^']+'/g);
  assert.ok(!tokens.includes("'unsafe-eval'"));
  assert.ok(!tokens.includes("'unsafe-inline'"));
  const refs = [m.background.service_worker, m.side_panel.default_path, ...m.content_scripts.flatMap((c) => c.js)];
  for (const f of refs) assert.ok(existsSync(join(root, 'dist', f)), `manifest ref ${f}`);
  for (const rel of filesUnder(join(root, 'src'))) {
    if (rel === 'content.js') continue;
    assert.ok(existsSync(join(root, 'dist', rel)), rel);
  }
  assert.ok(existsSync(join(root, 'dist/pages/README.md')));
  const content = readFileSync(join(root, 'dist/content.js'), 'utf8');
  assert.ok(!/^\s*(import|export)\b/m.test(content), 'content script is a classic script');
  assert.equal(existsSync(join(root, 'dist/chatgpt.js')), false);
  assert.match(content, /function createTracker/);
  assert.match(content, /function snapshotDocument/);
  assert.match(content, /function validateStoredProfile/);

  const pageDir = join(root, 'dist/manual');
  for (const f of [
    'lume-pdf.html',
    'lume-pdf.js',
    'pdf.worker.mjs',
    'ocr/worker.min.js',
    'ocr/tesseract-core-simd-lstm.wasm.js',
    'ocr/tesseract-core-lstm.wasm.js',
    'ocr/por.traineddata.gz',
  ]) assert.ok(existsSync(join(pageDir, f)), f);
  const html = readFileSync(join(pageDir, 'lume-pdf.html'), 'utf8');
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, 'PDF page has no inline script');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'PDF page has no inline event handler');
  const srcs = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi)].map((hit) => hit[1]);
  assert.ok(srcs.length >= 1);
  for (const src of srcs) {
    assert.equal(/^([a-z][a-z0-9+.-]*:)?\/\//i.test(src), false, `remote script ${src}`);
    const file = join(pageDir, src.replace(/^\.\//, ''));
    assert.ok(existsSync(file), src);
    execFileSync(process.execPath, ['--check', file]);
  }
  for (const f of ['lume-pdf.js', 'pdf.worker.mjs']) {
    const file = join(pageDir, f);
    execFileSync(process.execPath, ['--check', file]);
    const js = readFileSync(file, 'utf8');
    assert.doesNotMatch(js, /\beval\s*\(/);
    assert.doesNotMatch(js, /new Function\s*\(/);
  }
  assert.match(readFileSync(join(pageDir, 'lume-pdf.js'), 'utf8'), /pdf\.worker\.mjs/);
  const studyJs = readFileSync(join(root, 'dist/study.js'), 'utf8');
  const studyHtml = readFileSync(join(root, 'dist/study.html'), 'utf8');
  assert.doesNotMatch(studyJs, /cdn\.jsdelivr\.net/);
  assert.doesNotMatch(studyHtml, /<script(?![^>]*\bsrc=)[^>]*>/i);
  assert.match(studyJs, /segmentAutos/);
  assert.match(readFileSync(join(root, 'src/panel.html'), 'utf8'), /<ol id="guide">/);
});

test('Portuguese traineddata is bundled and no tesseract asset URL is remote', () => {
  const remote = /https?:\/\/[^'"\s)\\]*?(?:jsdelivr\.net|unpkg\.com|tesseract\.js-data|traineddata|tesseract\.js@|tesseract\.js-core@)/i;
  const por = readFileSync(join(root, 'dist/manual/ocr/por.traineddata.gz'));
  assert.ok(por.length > 1000);
  assert.equal(por[0], 0x1f);
  assert.equal(por[1], 0x8b);
  const bundled = [
    'dist/study.js',
    'dist/manual/lume-pdf.js',
    'dist/manual/ocr/worker.min.js',
    'dist/manual/ocr/tesseract-core-simd-lstm.wasm.js',
    'dist/manual/ocr/tesseract-core-lstm.wasm.js',
  ];
  for (const rel of bundled) {
    const text = readFileSync(join(root, rel));
    assert.equal(remote.test(text.toString('latin1')), false, rel);
  }
  const study = readFileSync(join(root, 'dist/study.js'), 'utf8');
  assert.match(study, /getURL\(\s*["']manual\/["']\s*\)/);
  assert.match(study, /ocr\/worker\.min\.js/);
  assert.match(study, /ocr\/tesseract-core-simd-lstm\.wasm\.js/);
  assert.match(study, /ocr\/tesseract-core-lstm\.wasm\.js/);
  assert.match(study, /["']por["']/);
});

test('panel has the package button and calibration link', () => {
  const html = readFileSync(join(root, 'src/panel.html'), 'utf8');
  const js = readFileSync(join(root, 'src/panel.js'), 'utf8');
  assert.match(html, /id="package-mode"[^>]*>Gerar pacote do caso</);
  assert.match(html, /id="pdf-hint"[^>]*>Baixe o processo completo no PJe \(Download dos autos\) e abra o PDF aqui\./);
  assert.match(html, /id="calibrate"[^>]*>Calibrar PJe</);
  assert.match(html, /id="study"[^>]*>Estudar processo</);
  assert.match(js, /\$\('pdf-hint'\)\.hidden = v\.statusKey !== 'not_pje'/);
  assert.match(js, /chrome\.tabs\.create\(\{ url: chrome\.runtime\.getURL\('manual\/lume-pdf\.html'\) \}\)/);
  assert.match(js, /\$\('package-mode'\)/);
});

test('toolbar click with no panel opens the PDF page and adds no permission', () => {
  const js = readFileSync(join(root, 'src/worker.js'), 'utf8');
  const m = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.permissions, ['sidePanel', 'storage']);
  assert.match(js, /chrome\.action\.onClicked\.addListener/);
  assert.match(js, /if \(!panelClickOpensPanel\) openPdfMode\(\)/);
  assert.match(js, /chrome\.tabs\.create\(\{ url: chrome\.runtime\.getURL\(PDF_PAGE\) \}\)/);
  assert.match(js, /openPanelOnActionClick: true/);
  assert.match(js, /enabled: true/);
  assert.doesNotMatch(js, /enabled:\s*false/);
});

test('source never touches credentials, cookies, certificates or navigation', () => {
  const forbidden = /document\.cookie|chrome\.cookies|credentials:\s*['"]include|localStorage|location\.(assign|replace|reload)|location\.href\s*=|window\.open|\.click\(|\.submit\(|chrome\.debugger|webRequest|setInterval/;
  for (const rel of filesUnder(join(root, 'src'))) {
    const lines = readFileSync(join(root, 'src', rel), 'utf8').split('\n');
    lines.forEach((line, i) => assert.ok(!forbidden.test(line), `${rel}:${i + 1} uses a forbidden API`));
  }
});

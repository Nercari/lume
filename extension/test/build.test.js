import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;

test('build emits a loadable unpacked extension with only the documented permissions', { timeout: 180_000 }, () => {
  execFileSync(process.execPath, [join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
  const m = JSON.parse(readFileSync(join(root, 'dist/manifest.json'), 'utf8'));
  assert.equal(m.manifest_version, 3);
  assert.deepEqual(m.permissions, ['sidePanel']);
  assert.equal(m.host_permissions, undefined);
  assert.equal(m.optional_permissions, undefined);
  assert.equal(m.optional_host_permissions, undefined);
  assert.equal(m.web_accessible_resources, undefined);
  assert.equal(m.externally_connectable, undefined);
  assert.deepEqual(m.content_scripts.map((c) => c.matches), [['https://pje1g.trf1.jus.br/pje/*']]);
  const csp = m.content_security_policy.extension_pages;
  assert.equal(csp, "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'");
  const tokens = csp.match(/'[^']+'/g);
  assert.ok(!tokens.includes("'unsafe-eval'"));
  assert.ok(!tokens.includes("'unsafe-inline'"));
  const refs = [m.background.service_worker, m.side_panel.default_path, ...m.content_scripts.flatMap((c) => c.js)];
  for (const f of refs) assert.ok(existsSync(join(root, 'dist', f)), `manifest ref ${f}`);
  for (const f of ['manifest.json', 'worker.js', 'content.js', 'panel.html', 'panel.js', 'core.js']) assert.ok(existsSync(join(root, 'dist', f)), f);
  const content = readFileSync(join(root, 'dist/content.js'), 'utf8');
  assert.ok(!/^\s*(import|export)\b/m.test(content), 'content script is a classic script');
  assert.match(content, /function createTracker/);

  const pageDir = join(root, 'dist/manual');
  for (const f of ['lume-pdf.html', 'lume-pdf.js', 'pdf.worker.mjs']) assert.ok(existsSync(join(pageDir, f)), f);
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
});

test('panel has the PDF button and the offline hint', () => {
  const html = readFileSync(join(root, 'src/panel.html'), 'utf8');
  const js = readFileSync(join(root, 'src/panel.js'), 'utf8');
  assert.match(html, /id="pdf-mode"[^>]*>Abrir modo PDF</);
  assert.match(html, /id="pdf-hint"[^>]*>Baixe o processo completo no PJe \(Download dos autos\) e abra o PDF aqui\.</);
  assert.match(js, /\$\('pdf-hint'\)\.hidden = v\.statusKey !== 'not_pje'/);
  assert.match(js, /chrome\.tabs\.create\(\{ url: chrome\.runtime\.getURL\('manual\/lume-pdf\.html'\) \}\)/);
});

test('toolbar click with no panel opens the PDF page and adds no permission', () => {
  const js = readFileSync(join(root, 'src/worker.js'), 'utf8');
  const m = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'));
  assert.deepEqual(m.permissions, ['sidePanel']);
  assert.match(js, /chrome\.action\.onClicked\.addListener/);
  assert.match(js, /if \(!panelClickOpensPanel\) openPdfMode\(\)/);
  assert.match(js, /chrome\.tabs\.create\(\{ url: chrome\.runtime\.getURL\(PDF_PAGE\) \}\)/);
  assert.match(js, /openPanelOnActionClick: true/);
  assert.match(js, /enabled: true/);
  assert.doesNotMatch(js, /enabled:\s*false/);
});

test('source never touches credentials, cookies, certificates or navigation', () => {
  const forbidden = /document\.cookie|chrome\.cookies|credentials:\s*['"]include|localStorage|location\.(assign|replace|reload)|location\.href\s*=|window\.open|\.click\(|\.submit\(|chrome\.debugger|webRequest|setInterval/;
  for (const f of readdirSync(join(root, 'src'))) {
    const lines = readFileSync(join(root, 'src', f), 'utf8').split('\n');
    lines.forEach((l, i) => assert.ok(!forbidden.test(l), `${f}:${i + 1} uses a forbidden API`));
  }
});

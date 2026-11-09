import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeImagePdf, pngFromGray, renderWord } from '../../manual/test/bitmap.js';

const dist = new URL('../dist/', import.meta.url);
const fixture = (name) => new URL(`./fixtures/${name}`, import.meta.url);

test('one click collects every synthetic document, OCRs, and attaches the parts', { timeout: 300_000 }, async () => {
  const { chromium } = await import('playwright-core');
  const shell = await readFile(fixture('pje-shell.html'), 'utf8');
  const list1 = await readFile(fixture('pje-list-1.html'), 'utf8');
  const list2 = await readFile(fixture('pje-list-2.html'), 'utf8');
  const composer = await readFile(fixture('chatgpt-composer.html'), 'utf8');
  const htmlDoc = '<!doctype html><html><body><p>TOKENHTML</p></body></html>';
  const image = renderWord('LAUDO', 12, 48);
  const pdf = makeImagePdf(image);
  const png = pngFromGray(image);
  const userData = await mkdtemp(join(tmpdir(), 'lume-e2e-'));
  const extensionPath = fileURLToPath(dist);
  let context;
  try {
    context = await chromium.launchPersistentContext(userData, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        '--no-sandbox',
        '--disable-dev-shm-usage',
        // The first navigation of a tab Chrome opens itself can leave Playwright's
        // route. Pin that host to loopback so the miss never reaches the network.
        '--host-resolver-rules=MAP chatgpt.com 127.0.0.1',
      ],
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    const extensionId = new URL(worker.url()).host;
    await context.route('https://pje1g.trf1.jus.br/**', (route) => fulfillPje(route, { shell, list1, list2, htmlDoc, pdf, png }));
    await context.route('https://chatgpt.com/**', (route) => {
      if (route.request().resourceType() !== 'document') return route.abort();
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: composer,
      });
    });
    const opened = [];
    context.on('page', (page) => {
      opened.push(page);
      armComposerFixture(page);
    });
    const pje = await context.newPage();
    await pje.goto('https://pje1g.trf1.jus.br/pje/Processo/ConsultaDocumento/listView.seam', { waitUntil: 'domcontentloaded' });
    await pje.frameLocator('#caso').locator('#listaDocumentos tr').nth(1).waitFor({ timeout: 15_000 });
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/panel.html`);
    await panel.locator('#study').click({ timeout: 20_000 });
    const study = await waitFor(opened, (page) => page.url().includes('study.html'));
    await study.locator('#result[data-state="attached"], #result[data-state="failed"]').waitFor({ timeout: 240_000 });
    const preview = await study.locator('#preview').textContent();
    const state = await study.locator('#result').getAttribute('data-state');
    const resultText = await study.locator('#result').textContent();
    assert.match(preview ?? '', /TOKENHTML/);
    assert.match(preview ?? '', /LAUDO/);
    assert.match(preview ?? '', /DOC1/);
    assert.match(preview ?? '', /DOC2/);
    assert.match(preview ?? '', /DOC3/);
    assert.equal(state, 'attached', resultText ?? '');
    const chatgpt = await waitFor(opened, (page) => page.url().startsWith('https://chatgpt.com/'));
    await chatgpt.waitForTimeout(500);
    const attached = await chatgpt.evaluate(() => {
      const root = document.querySelector('[data-lume-composer]');
      const input = root?.querySelector('input[type="file"]');
      const prompt = root?.querySelector('textarea');
      return {
        files: [...(input?.files ?? [])].map((file) => ({ name: file.name, size: file.size })),
        prompt: prompt?.value ?? '',
        sent: document.documentElement.dataset.sent ?? '',
      };
    });
    assert.equal(attached.sent, '');
    assert.equal(attached.prompt, 'Estudo integral: leia todas as 1 partes anexadas antes de qualquer minuta.');
    assert.equal(attached.files.length, 1);
    assert.equal(attached.files[0].name, 'lume-caso-parte-01-de-01.md');
    assert.ok(attached.files[0].size > 50);
  } finally {
    await context?.close();
    await rm(userData, { recursive: true, force: true });
  }
});

// Chrome's own tabs.create can commit the first response before Playwright
// attaches its route. Load the composer fixture once the page exists.
function armComposerFixture(page) {
  let replaced = false;
  const replace = async () => {
    if (replaced) return;
    const url = page.url();
    const chat = url.startsWith('https://chatgpt.com/');
    const error = url.startsWith('chrome-error://');
    if (!chat && !error) return;
    if (chat && await page.locator('[data-lume-composer]').count().catch(() => 0)) return;
    replaced = true;
    await page.goto('https://chatgpt.com/', { waitUntil: 'domcontentloaded' });
  };
  page.on('domcontentloaded', () => { replace().catch(() => {}); });
}

function waitFor(pages, predicate) {
  const found = pages.find(predicate);
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('expected page did not open'));
    }, 30_000);
    const interval = setInterval(() => {
      const page = pages.find(predicate);
      if (!page) return;
      clearTimeout(timer);
      clearInterval(interval);
      resolve(page);
    }, 50);
  });
}

async function fulfillPje(route, files) {
  const url = new URL(route.request().url());
  const path = url.pathname + url.search;
  if (path.startsWith('/pje/list-frame') && url.searchParams.get('p') === '2') {
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: files.list2 });
  }
  if (path.startsWith('/pje/list-frame')) {
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: files.list1 });
  }
  if (path === '/pje/doc?id=DOC1') {
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: files.htmlDoc });
  }
  if (path === '/pje/doc?id=DOC2') {
    return route.fulfill({ status: 200, contentType: 'application/pdf', body: files.pdf });
  }
  if (path === '/pje/doc?id=DOC3') {
    return route.fulfill({ status: 200, contentType: 'image/png', body: files.png });
  }
  if (url.pathname.includes('listView.seam')) {
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: files.shell });
  }
  return route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing' });
}

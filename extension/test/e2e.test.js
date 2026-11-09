import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pngFromGray, renderWord } from '../../manual/test/bitmap.js';

const dist = new URL('../dist/', import.meta.url);
const CASE_A = 'https://pje1g.trf1.jus.br/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=1&ca=token';
const CASE_B = 'https://pje1g.trf1.jus.br/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=2&ca=token';

function textPdf(word) {
  const stream = `BT /F1 24 Tf 40 90 Td (${word}) Tj ET`;
  const objects = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n',
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream\nendobj\n`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(Buffer.byteLength(body));
    body += object;
  }
  const xref = Buffer.byteLength(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += '0000000000 65535 f \n';
  for (let i = 1; i <= objects.length; i += 1) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}

function timeline(ids, caseNumber) {
  const rows = ids.map((id) => `<div class="media"><a href="/pje/documento/download/${id}">ver</a><span class="data">01/01/2020</span></div>`).join('');
  return `<!doctype html><html><body><span class="numero-processo">${caseNumber}</span><span id="viewerCount">3 of 7</span><div id="divTimeLine">${rows}</div></body></html>`;
}

test('the page button reads fifty documents, then a second case cannot paint over the first', { timeout: 300_000 }, async () => {
  const { chromium } = await import('playwright-core');
  const htmlIds = Array.from({ length: 40 }, (_, i) => `H${String(i + 1).padStart(2, '0')}`);
  const pdfIds = Array.from({ length: 5 }, (_, i) => `P${String(i + 1).padStart(2, '0')}`);
  const scanIds = Array.from({ length: 5 }, (_, i) => `S${String(i + 1).padStart(2, '0')}`);
  const ids = [...htmlIds, ...pdfIds, ...scanIds];
  const pageA = timeline(ids, 'TEST-CASE-A');
  const pageB = timeline(['B01'], 'TEST-CASE-B');
  const pdf = textPdf('TEXTO');
  const png = pngFromGray(renderWord('LAUDO', 12, 48));
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
        '--host-resolver-rules=MAP pje1g.trf1.jus.br 127.0.0.1',
      ],
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    const extensionId = new URL(worker.url()).host;
    await context.route('https://pje1g.trf1.jus.br/**', async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname.includes('/documento/download/')) {
        await new Promise((resolve) => setTimeout(resolve, 150));
        const id = url.pathname.split('/').pop();
        if (id === 'B01') return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<p>CASEBTXT</p>' });
        if (id.startsWith('H')) {
          return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: `<p>${id}TXT</p>` });
        }
        if (id.startsWith('P')) return route.fulfill({ status: 200, contentType: 'application/pdf', body: pdf });
        if (id.startsWith('S')) return route.fulfill({ status: 200, contentType: 'image/png', body: png });
        return route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing' });
      }
      if (url.pathname.includes('listAutosDigitais')) {
        const body = url.searchParams.get('idProcesso') === '2' ? pageB : pageA;
        return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body });
      }
      return route.fulfill({ status: 404, contentType: 'text/plain', body: 'missing' });
    });
    const opened = [];
    context.on('page', (page) => opened.push(page));
    const pje = await context.newPage();
    await pje.goto(CASE_A, { waitUntil: 'domcontentloaded' });
    await pje.locator('#divTimeLine .media').nth(49).waitFor({ timeout: 15_000 });
    await pje.locator('#lume-estudar').waitFor({ timeout: 15_000 });
    const started = Date.now();
    await pje.locator('#lume-estudar').click({ timeout: 20_000 });
    await pje.waitForFunction(() => document.getElementById('lume-estudar')?.textContent.startsWith('Lume: estudando'));
    const study = await waitFor(opened, (page) => page.url().includes('study.html'));
    await study.locator('#result[data-state="view"], #result[data-state="failed"]').waitFor({ timeout: 240_000 });
    const totalMs = Date.now() - started;
    const state = await study.locator('#result').getAttribute('data-state');
    const resultText = await study.locator('#result').textContent();
    assert.equal(state, 'view', resultText ?? '');
    const preview = await study.locator('#preview').textContent();
    const measure = JSON.parse(await study.locator('#measure').textContent());
    assert.match(preview ?? '', /H01TXT/);
    assert.match(preview ?? '', /TEXTO/);
    assert.match(preview ?? '', /LAUDO/);
    assert.match(await study.locator('#parts').textContent(), /lume-caso-parte-01-de-01\.md/);
    assert.match(await study.locator('#parts').textContent(), /Copiar parte 1/);
    assert.equal(await study.locator('#save').textContent(), 'Salvar partes');
    assert.ok(study.url().startsWith(`chrome-extension://${extensionId}/`));
    assert.match(study.url(), /attach=0/);
    assert.equal(await study.locator('#result').getAttribute('data-attach'), '0');
    const viewPage = await waitFor(opened, (page) => page.url().includes('#lume-autos') || page.url().startsWith('chrome-error://'));
    await viewPage.goto(`${CASE_A}#lume-autos`, { waitUntil: 'domcontentloaded' });
    await viewPage.locator('#lume-caso').waitFor({ timeout: 20_000 });
    const root = viewPage.locator('#lume-caso-root');
    assert.equal(await root.getAttribute('data-formato'), 'lume-caso/1');
    assert.equal(await root.getAttribute('data-origem'), 'botao');
    const full = await viewPage.locator('#lume-caso').textContent();
    assert.match(full ?? '', /^---\nformato: lume-caso\/1\nprocesso: TEST-CASE-A\nparte: 1\ntotal: 1\norigem: botao\n---/);
    assert.match(full ?? '', /Índice/);
    await viewPage.waitForFunction(() => document.title.startsWith('Lume: pronto'));
    const gaps = Number(/Lacunas: (\d+)/.exec(full ?? '')?.[1]);
    assert.equal(await viewPage.title(), `Lume: pronto · 50 docs · ${gaps} lacunas · parte 1 de 1`);
    assert.match(full ?? '', /Documentos: 50/);
    assert.match(full ?? '', /ID \| Tipo \| Data \| Págs\. do documento \| Situação/);
    assert.match(full ?? '', /H01 \| .* \| 01\/01\/2020 \| 1 \| legível/);
    assert.match(full ?? '', /P01 \| .* \| 01\/01\/2020 \| (?:1|—) \| legível/);
    assert.match(full ?? '', /S01 \| .* \| 01\/01\/2020 \| 1 \| OCR/);
    assert.ok(full.indexOf('H01 |') < full.indexOf('H40 |'));
    assert.ok(full.indexOf('H40 |') < full.indexOf('P01 |'));
    assert.ok(full.indexOf('P05 |') < full.indexOf('S01 |'));
    assert.match(await viewPage.locator('#lume-copiar-parte').textContent(), /Copiar parte 1/);
    assert.equal(opened.some((page) => page.url().startsWith('https://chatgpt.com/')), false);
    assert.equal(measure.documents, 50);
    assert.equal(measure.ocrPerPage.length, 5);
    assert.ok(measure.fetchMs >= 50 * 140, `fetch ${measure.fetchMs}`);
    console.log(`MEASURE ${JSON.stringify({ totalSec: Number((totalMs / 1000).toFixed(2)), ...measure })}`);

    const seen = new Set(opened);
    const pjeB = await context.newPage();
    await pjeB.goto(CASE_B, { waitUntil: 'domcontentloaded' });
    await pjeB.locator('#lume-estudar').click({ timeout: 20_000 });
    const studyB = await waitFor(opened, (page) => page.url().includes('study.html') && !seen.has(page));
    await studyB.locator('#result[data-state="view"], #result[data-state="failed"]').waitFor({ timeout: 120_000 });
    assert.equal(await studyB.locator('#result').getAttribute('data-state'), 'view');
    const viewB = await waitFor(opened, (page) => !seen.has(page) && (page.url().includes('#lume-autos') || page.url().startsWith('chrome-error://')));
    await viewB.goto(`${CASE_B}#lume-autos`, { waitUntil: 'domcontentloaded' });
    await viewB.locator('#lume-caso').waitFor({ timeout: 20_000 });
    const textB = await viewB.locator('#lume-caso').textContent();
    assert.match(textB ?? '', /CASEBTXT/);
    assert.match(textB ?? '', /processo: TEST-CASE-B/);
    assert.equal(await viewB.title(), 'Lume: pronto · 1 docs · 0 lacunas · parte 1 de 1');
    await viewPage.goto(`${CASE_A}#lume-autos`, { waitUntil: 'domcontentloaded' });
    await viewPage.locator('#lume-caso').waitFor({ timeout: 20_000 });
    const again = await viewPage.locator('#lume-caso').textContent();
    assert.match(again ?? '', /processo: TEST-CASE-A/);
    assert.equal((again ?? '').includes('CASEBTXT'), false);
    assert.equal(await viewPage.title(), `Lume: pronto · 50 docs · ${gaps} lacunas · parte 1 de 1`);
  } finally {
    await context?.close();
    await rm(userData, { recursive: true, force: true });
  }
});

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

// Private timing run. Prints counts and milliseconds only.
// npm run bench:fixture -- <dir> [--latency 150]

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFixture, reportFromMeasure, startFixtureServer } from './bench-lib.mjs';

const CASE_PATH = '/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=1&ca=token';
const CASE_URL = `https://pje1g.trf1.jus.br${CASE_PATH}`;

function argsOf(argv) {
  let latencyMs = 150;
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--latency') latencyMs = Number(argv[++i]);
    else if (arg.startsWith('--latency=')) latencyMs = Number(arg.slice('--latency='.length));
    else positional.push(arg);
  }
  return { dir: positional[0], latencyMs };
}

function ensureBuilt(root) {
  const trained = join(root, 'dist/manual/ocr/por.traineddata.gz');
  if (existsSync(trained)) return;
  const built = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
  if (built.status !== 0 || !existsSync(trained)) {
    throw new Error('the extension build did not produce the bundled Portuguese traineddata');
  }
}

async function main() {
  const { dir, latencyMs } = argsOf(process.argv.slice(2));
  if (!dir || !Number.isFinite(latencyMs) || latencyMs < 0) {
    process.stderr.write('usage: npm run bench:fixture -- <dir> [--latency 150]\n');
    process.exit(2);
  }
  const docs = await loadFixture(dir);
  if (!docs.length) {
    process.stderr.write('no html, pdf, or png documents\n');
    process.exit(1);
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  ensureBuilt(root);
  const fixture = await startFixtureServer(docs, latencyMs);
  const { chromium } = await import('playwright-core');
  const userData = await mkdtemp(join(tmpdir(), 'lume-bench-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(userData, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${join(root, 'dist')}`,
        `--load-extension=${join(root, 'dist')}`,
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
      const local = await fetch(`http://127.0.0.1:${fixture.port}${url.pathname}${url.search}`);
      const body = Buffer.from(await local.arrayBuffer());
      await route.fulfill({
        status: local.status,
        contentType: local.headers.get('content-type') ?? 'application/octet-stream',
        body,
      });
    });
    const opened = [];
    context.on('page', (page) => opened.push(page));
    const pje = await context.newPage();
    await pje.goto(CASE_URL, { waitUntil: 'domcontentloaded' });
    await pje.locator('#divTimeLine .media').first().waitFor({ timeout: 15_000 });
    const panel = await context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/panel.html`);
    const started = Date.now();
    await panel.locator('#study').click({ timeout: 20_000 });
    const study = await waitFor(opened, (page) => page.url().includes('study.html'));
    const budget = Math.max(300_000, docs.length * 60_000);
    await study.locator('#result[data-state="view"], #result[data-state="failed"]').waitFor({ timeout: budget });
    const totalMs = Date.now() - started;
    const state = await study.locator('#result').getAttribute('data-state');
    if (state !== 'view') throw new Error('the study did not finish');
    const measure = JSON.parse(await study.locator('#measure').textContent());
    process.stdout.write(`${JSON.stringify(reportFromMeasure(measure, { totalMs, latencyMs }))}\n`);
  } finally {
    await context?.close();
    await rm(userData, { recursive: true, force: true });
    await fixture.close();
  }
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

main().catch((error) => {
  process.stderr.write(`${error?.message || 'bench failed'}\n`);
  process.exit(1);
});

// One-click synthetic eval. Builds the extension if needed, runs the real
// built extension headless against generated PJe cases, clicks "Estudar
// processo" and prints one JSON report. No real case, no network, no sign-in.
// npm run eval:synthetic [--runs 3] [--latency 150]

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ensureBuilt, startFixtureServer } from './bench-lib.mjs';
import { caseSpecs, expectationOf, fixtureDocs, writeCase } from './eval-fixture.mjs';
import { combineScores, scoreCase } from './eval-score.mjs';

const HOST = 'pje1g.trf1.jus.br';
const caseUrl = (index) => `https://${HOST}/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam?idProcesso=${index + 1}&ca=token`;

function argsOf(argv) {
  let runs = 3;
  let latencyMs = 150;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = (name) => (arg === `--${name}` ? argv[++i] : arg.startsWith(`--${name}=`) ? arg.slice(name.length + 3) : null);
    const r = value('runs');
    if (r != null) runs = Number(r);
    const l = value('latency');
    if (l != null) latencyMs = Number(l);
  }
  return { runs, latencyMs };
}

function waitForNew(context, before, predicate, timeout = 30_000) {
  const found = context.pages().find((page) => !before.has(page) && predicate(page));
  if (found) return Promise.resolve(found);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      clearInterval(interval);
      reject(new Error('expected page did not open'));
    }, timeout);
    const interval = setInterval(() => {
      const page = context.pages().find((candidate) => !before.has(candidate) && predicate(candidate));
      if (!page) return;
      clearTimeout(timer);
      clearInterval(interval);
      resolve(page);
    }, 50);
  });
}

async function runOne(context, panel, panelUrl, spec, index) {
  const pje = await context.newPage();
  try {
    await pje.goto(caseUrl(index), { waitUntil: 'domcontentloaded' });
    await pje.locator('#divTimeLine .media').first().waitFor({ timeout: 15_000 });
    await pje.locator('#lume-estudar').waitFor({ timeout: 15_000 });
    await pje.bringToFront();
    await panel.goto(panelUrl);
    await panel.waitForFunction((processo) => document.getElementById('case')?.textContent === processo, spec.processo, { timeout: 20_000 });
    await panel.waitForFunction(() => {
      const button = document.getElementById('study');
      return button && !button.disabled;
    }, null, { timeout: 20_000 });
    const before = new Set(context.pages());
    const started = Date.now();
    await panel.locator('#study').click({ timeout: 20_000 });
    const study = await waitForNew(context, before, (page) => page.url().includes('study.html'));
    const budget = Math.max(300_000, spec.docs.length * 60_000);
    await study.locator('#result[data-state="view"], #result[data-state="failed"], #result[data-state="cancelled"]').waitFor({ timeout: budget });
    const seconds = (Date.now() - started) / 1000;
    const state = await study.locator('#result').getAttribute('data-state');
    if (state !== 'view') {
      const detail = String(await study.locator('#result').textContent()).slice(0, 120);
      throw new Error(`${spec.id}: the study ended in "${state}": ${detail}`);
    }
    const artifact = await study.evaluate(async () => {
      const parts = [];
      for (const link of document.querySelectorAll('#parts a')) parts.push(await (await fetch(link.href)).text());
      const sigilo = document.getElementById('sigilo');
      return {
        text: parts.join('\n\n'),
        sidecar: JSON.parse(document.getElementById('sidecar').textContent || 'null'),
        sigilo: sigilo ? { hidden: sigilo.hidden, text: sigilo.textContent } : null,
      };
    });
    return { score: scoreCase(spec.expectation, artifact), seconds };
  } finally {
    for (const page of context.pages()) {
      if (page === panel || page === pje || page.closed) continue;
      await page.close().catch(() => {});
    }
    await pje.close().catch(() => {});
  }
}

async function main() {
  const { runs, latencyMs } = argsOf(process.argv.slice(2));
  if (!Number.isInteger(runs) || runs < 1 || !Number.isFinite(latencyMs) || latencyMs < 0) {
    process.stderr.write('usage: npm run eval:synthetic [--runs 3] [--latency 150]\n');
    process.exit(2);
  }
  const specs = caseSpecs().map((spec) => ({ ...spec, expectation: expectationOf(spec) }));
  for (const spec of specs) {
    if (spec.docs.length < 8) throw new Error(`${spec.id}: a synthetic case needs at least 8 documents`);
  }
  const root = fileURLToPath(new URL('..', import.meta.url));
  ensureBuilt(root);
  const dir = await mkdtemp(join(tmpdir(), 'lume-eval-'));
  await Promise.all(specs.map((spec) => writeCase(join(dir, spec.id), spec)));
  const servers = await Promise.all(specs.map((spec) => startFixtureServer(fixtureDocs(spec), latencyMs, { caseNumber: spec.processo })));
  const state = { index: 0 };
  const { chromium } = await import('playwright-core');
  const userData = await mkdtemp(join(tmpdir(), 'lume-eval-browser-'));
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
        `--host-resolver-rules=MAP ${HOST} 127.0.0.1`,
      ],
    });
    let worker = context.serviceWorkers()[0];
    if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
    const extensionId = new URL(worker.url()).host;
    await context.route(`https://${HOST}/**`, async (route) => {
      const url = new URL(route.request().url());
      const local = await fetch(`http://127.0.0.1:${servers[state.index].port}${url.pathname}${url.search}`);
      const body = Buffer.from(await local.arrayBuffer());
      await route.fulfill({
        status: local.status,
        contentType: local.headers.get('content-type') ?? 'application/octet-stream',
        body,
      });
    });
    const panel = await context.newPage();
    const panelUrl = `chrome-extension://${extensionId}/panel.html`;
    await panel.goto(panelUrl);
    const perRun = [];
    const seconds = [];
    for (let run = 0; run < runs; run += 1) {
      const scores = [];
      for (let index = 0; index < specs.length; index += 1) {
        state.index = index;
        const result = await runOne(context, panel, panelUrl, specs[index], index);
        scores.push(result.score);
        seconds.push(result.seconds);
      }
      perRun.push(scores);
    }
    const report = combineScores(perRun, { runs, latencyMs, fixtureVersion: specs[0].expectation.fixtureVersion, seconds });
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    await context?.close();
    await Promise.all(servers.map((server) => server.close()));
    await rm(userData, { recursive: true, force: true });
    await rm(dir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  process.stderr.write(`${error?.message || 'eval failed'}\n`);
  process.exit(1);
});

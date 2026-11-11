// Fixture server for a private timing run. Ids are D01, D02, … so a file name
// never has to appear in the timeline or in the JSON report.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

const TYPES = new Map([
  ['.html', 'text/html'],
  ['.htm', 'text/html'],
  ['.pdf', 'application/pdf'],
  ['.png', 'image/png'],
]);

export async function loadFixture(dir) {
  const names = (await readdir(dir)).filter((name) => TYPES.has(extname(name).toLowerCase())).sort();
  const docs = [];
  for (const name of names) {
    const index = docs.length + 1;
    docs.push({
      id: `D${String(index).padStart(2, '0')}`,
      type: TYPES.get(extname(name).toLowerCase()),
      bytes: await readFile(join(dir, name)),
    });
  }
  return docs;
}

export function timelineHtml(docs, caseNumber = 'TEST-CASE-A') {
  const rows = docs
    .map((doc) => `<div class="media"${doc.sigilo ? ' data-sigilo' : ''}><a href="/pje/documento/download/${doc.id}">ver</a><span class="data">01/01/2020</span></div>`)
    .join('');
  return `<!doctype html><html><body><span class="numero-processo">${caseNumber}</span><div id="divTimeLine">${rows}</div></body></html>`;
}

export function ensureBuilt(root) {
  const trained = join(root, 'dist/manual/ocr/por.traineddata.gz');
  if (existsSync(trained)) return;
  const built = spawnSync(process.execPath, [join(root, 'scripts/build.mjs')], { stdio: 'inherit' });
  if (built.status !== 0 || !existsSync(trained)) {
    throw new Error('the extension build did not produce the bundled Portuguese traineddata');
  }
}

export function reportFromMeasure(measure, { totalMs, latencyMs }) {
  const pages = Array.isArray(measure?.ocrPerPage) ? measure.ocrPerPage : [];
  const round = (value) => Math.round(Number(value) || 0);
  return {
    documents: round(measure?.documents),
    latencyMs: round(latencyMs),
    totalSec: Math.round(Number(totalMs) / 10) / 100,
    fetchMs: round(measure?.fetchMs),
    textMs: round(measure?.textMs),
    ocrMs: round(measure?.ocrMs),
    ocrPages: pages.length,
    ocrPerPageMs: pages.map((page) => round(page?.ms)),
  };
}

export function startFixtureServer(docs, latencyMs, { caseNumber = 'TEST-CASE-A' } = {}) {
  const byId = new Map(docs.map((doc) => [doc.id, doc]));
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (url.pathname.includes('listAutosDigitais')) {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(timelineHtml(docs, caseNumber));
        return;
      }
      const id = decodeURIComponent(url.pathname.split('/').pop() || '');
      const doc = url.pathname.includes('/documento/download/') ? byId.get(id) : null;
      if (!doc) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('missing');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
      if (doc.status && doc.status !== 200) {
        res.writeHead(doc.status, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('');
        return;
      }
      res.writeHead(200, { 'content-type': doc.type });
      res.end(doc.bytes);
    } catch {
      res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
      res.end('error');
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        port: typeof address === 'object' && address ? address.port : 0,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadFixture, reportFromMeasure, startFixtureServer, timelineHtml } from '../scripts/bench-lib.mjs';

test('the fixture report has counts and timings and no document text', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'lume-fixture-'));
  const secret = 'TOKENSECRETO';
  try {
    await writeFile(join(dir, 'segredo-do-arquivo.html'), `<p>${secret}</p>`);
    await writeFile(join(dir, 'nota.pdf'), Buffer.from('%PDF-1.4'));
    const docs = await loadFixture(dir);
    assert.deepEqual(docs.map((doc) => doc.id), ['D01', 'D02']);
    assert.equal(timelineHtml(docs).includes('segredo'), false);
    assert.equal(timelineHtml(docs).includes(secret), false);
    const server = await startFixtureServer(docs, 40);
    try {
      const started = Date.now();
      const page = await fetch(`http://127.0.0.1:${server.port}/pje/Processo/ConsultaProcesso/Detalhe/listAutosDigitais.seam`);
      const html = await page.text();
      assert.match(html, /documento\/download\/D01/);
      assert.equal(html.includes(secret), false);
      const htmlDoc = docs.find((doc) => doc.type === 'text/html');
      const file = await fetch(`http://127.0.0.1:${server.port}/pje/documento/download/${htmlDoc.id}`);
      assert.equal(file.headers.get('content-type'), 'text/html');
      assert.ok(Date.now() - started >= 40);
      const body = await file.text();
      assert.equal(body.includes(secret), true);
    } finally {
      await server.close();
    }
    const report = reportFromMeasure({
      documents: 2,
      fetchMs: 80.4,
      textMs: 3.2,
      ocrMs: 10.6,
      ocrPerPage: [{ id: 'D02', page: 1, ms: 10.6, text: secret }],
    }, { totalMs: 1234, latencyMs: 40 });
    const json = JSON.stringify(report);
    assert.equal(json.includes(secret), false);
    assert.equal(json.includes('segredo'), false);
    assert.deepEqual(report, {
      documents: 2,
      latencyMs: 40,
      totalSec: 1.23,
      fetchMs: 80,
      textMs: 3,
      ocrMs: 11,
      ocrPages: 1,
      ocrPerPageMs: [11],
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

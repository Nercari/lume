import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { countFieldValues } from '../src/report.js';
import { at, makePdf } from './pdf-fixture.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts/eval-private.mjs');

function run(pdfDir, outDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, pdfDir, outDir], { cwd: root });
    let stderr = '';
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stderr }));
  });
}

test('the private eval writes aggregates only', async () => {
  const pdfDir = await mkdtemp(join(tmpdir(), 'lume-manual-pdf-'));
  const outDir = await mkdtemp(join(tmpdir(), 'lume-manual-out-'));
  const plantedName = 'NOMEPLANTAUNICO';
  const plantedId = '918273';
  const plantedRun = '54321';
  const fileName = `a-${plantedName}-${plantedId}.pdf`;
  try {
    await writeFile(join(pdfDir, fileName), makePdf({
      pages: [
        [
          at('Id Data Documento/Tipo', 740),
          at(`${plantedId} 01/02/2020 Peticao Inicial`, 720),
          at(`${plantedName} ${plantedRun}`, 700),
        ],
        [
          at(`${plantedName} no corpo ${plantedRun}.`, 700),
          at(`Num. ${plantedId} - Pag. 1`, 40),
        ],
        [],
      ],
      outlines: [{ title: `${plantedId} - Peticao Inicial`, page: 1 }],
    }));
    await writeFile(join(pdfDir, 'b-plain.pdf'), makePdf({
      pages: [[at('Folha sem sinal.', 700)]],
    }));
    await writeFile(join(pdfDir, 'c-broken.pdf'), Buffer.from('%PDF-1.4 not a real xref'));

    const { code, stderr } = await run(pdfDir, outDir);
    assert.equal(code, 0, stderr);
    const jsonText = await readFile(join(outDir, 'report.json'), 'utf8');
    const markdown = await readFile(join(outDir, 'report.md'), 'utf8');
    const report = JSON.parse(jsonText);
    assert.deepEqual(report.files.map((file) => file.label), ['case-01', 'case-02', 'case-03']);
    const first = report.files[0];
    assert.equal(first.pages, 3);
    assert.equal(first.pagesWithTextPct, 67);
    assert.equal(first.pagesNeedingOcr, 1);
    assert.ok(first.documentsFound >= 1);
    assert.ok(first.signalsUsed.includes('footer'));
    assert.equal(first.pieceTypeCounts['petição inicial'], 1);
    assert.equal(typeof first.footerProvenanceCoveragePct, 'number');
    assert.equal(typeof first.footerIdConflictPages, 'number');
    assert.ok(first.documentTypeSources.index >= 1);
    assert.equal(
      Object.values(first.documentTypeSources).reduce((sum, n) => sum + n, 0),
      first.documentsFound,
    );
    assert.equal(first.documentPagesMin, 1);
    assert.ok(first.documentPagesMedian >= 1);
    assert.equal(typeof first.timingMs, 'number');
    assert.equal(report.files[2].readable, false);
    assert.equal(report.files[2].pages, 0);

    const combined = `${jsonText}\n${markdown}\n${stderr}`;
    for (const secret of [plantedName, plantedId, plantedRun, fileName, 'b-plain', 'c-broken', 'PARTE']) {
      assert.equal(combined.includes(secret), false, secret);
    }
    const allowed = countFieldValues(report);
    for (const run of combined.matchAll(/\d{5,}/g)) {
      assert.ok(allowed.has(run[0]), `digit run ${run[0]}`);
    }
  } finally {
    await rm(pdfDir, { recursive: true, force: true });
    await rm(outDir, { recursive: true, force: true });
  }
});

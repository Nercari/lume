#!/usr/bin/env node
// Private aggregate over a directory of PDFs. Writes counts only.
// Labels are case-01, case-02, … in sorted file order. Names, ids, excerpts
// and the original file names are not written. Real-case runs stay off CI.
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, extname } from 'node:path';
import { performance } from 'node:perf_hooks';
import { segmentAutos } from '../src/segment.js';
import { emptySummary, labelFor, renderReportMarkdown, summarizeCase } from '../src/report.js';

const pdfDir = process.argv[2];
const outDir = process.argv[3];
if (!pdfDir || !outDir) {
  console.error('usage: node scripts/eval-private.mjs <pdfDir> <outDir>');
  process.exit(2);
}

let names;
try {
  names = (await readdir(pdfDir)).filter((name) => extname(name).toLowerCase() === '.pdf').sort((a, b) => a.localeCompare(b));
} catch {
  console.error('pdf directory not found');
  process.exit(2);
}

const files = [];
for (let i = 0; i < names.length; i++) {
  const label = labelFor(i);
  const started = performance.now();
  try {
    const bytes = await readFile(join(pdfDir, names[i]));
    const result = await segmentAutos(bytes);
    files.push(summarizeCase(label, result, performance.now() - started));
  } catch {
    files.push(emptySummary(label, performance.now() - started));
  }
}

const report = { mode: 'manual-pdf', files };
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(join(outDir, 'report.md'), renderReportMarkdown(report));
console.error(`wrote ${files.length} aggregate(s)`);

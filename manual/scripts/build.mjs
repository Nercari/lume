#!/usr/bin/env node
// Browser page: one HTML file, one bundled script, one pdf.js worker.
// No CDN. The worker is the same pdfjs-dist build the segmenter imports.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
await mkdir(dist, { recursive: true });

const html = await readFile(join(root, 'web/index.html'), 'utf8');
if (!html.includes('./lume-pdf.js')) throw new Error('page must load ./lume-pdf.js');
await writeFile(join(dist, 'lume-pdf.html'), html);

await esbuild.build({
  entryPoints: [join(root, 'web/app.js')],
  bundle: true,
  format: 'esm',
  outfile: join(dist, 'lume-pdf.js'),
  platform: 'browser',
  target: ['es2022'],
  legalComments: 'inline',
  logLevel: 'warning',
});

await copyFile(
  join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
  join(dist, 'pdf.worker.mjs'),
);

console.log('build: dist/lume-pdf.html dist/lume-pdf.js dist/pdf.worker.mjs');

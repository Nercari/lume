#!/usr/bin/env node
// Browser page: one HTML file, one bundled script, one pdf.js worker.
// No CDN. The worker is the same pdfjs-dist build the segmenter imports.
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

// Browser OCR loads these by URL. The .wasm.js files embed the LSTM wasm;
// corePath points at one file so Chromium does not pick a variant we did not ship.
const OCR_FILES = [
  ['node_modules/tesseract.js/dist/worker.min.js', 'ocr/worker.min.js'],
  ['node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'ocr/tesseract-core-simd-lstm.wasm.js'],
  ['node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js', 'ocr/tesseract-core-lstm.wasm.js'],
  ['node_modules/@tesseract.js-data/por/4.0.0_best_int/por.traineddata.gz', 'ocr/por.traineddata.gz'],
];

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
  plugins: [{
    name: 'no-ocr-cdn',
    setup(build) {
      build.onLoad({ filter: /node_modules\/tesseract\.js\/.*\.js$/ }, async (args) => {
        const source = await readFile(args.path, 'utf8');
        if (!source.includes('cdn.jsdelivr.net')) return null;
        return {
          contents: source.replaceAll('cdn.jsdelivr.net', 'ocr.invalid'),
          loader: 'js',
        };
      });
    },
  }],
});

await copyFile(
  join(root, 'node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'),
  join(dist, 'pdf.worker.mjs'),
);

for (const [from, to] of OCR_FILES) {
  const target = join(dist, to);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(root, from), target);
}

console.log(`build: dist/lume-pdf.html dist/lume-pdf.js dist/pdf.worker.mjs ${OCR_FILES.map(([, to]) => `dist/${to}`).join(' ')}`);

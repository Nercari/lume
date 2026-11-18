import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOcrSession, ocrPaths, tesseractOptions } from '../src/ocr.js';
import { OCR_MIN_LETTERS, ocrHasText } from '../src/ocr-text.js';
import { buildCasePack } from '../src/pack.js';
import { segmentAutos } from '../src/segment.js';
import { makePdf } from './pdf-fixture.js';

test('tesseract options point at local files and refuse a blob worker', () => {
  const paths = ocrPaths('https://example.invalid/manual/lume-pdf.js');
  const options = tesseractOptions(paths);
  assert.equal(options.workerBlobURL, false);
  assert.equal(options.gzip, true);
  assert.equal(options.cacheMethod, 'none');
  assert.equal(options.workerPath, 'https://example.invalid/manual/ocr/worker.min.js');
  assert.match(options.corePath, /tesseract-core-simd-lstm\.wasm\.js$/);
  assert.match(paths.coreFallback, /tesseract-core-lstm\.wasm\.js$/);
  assert.match(options.langPath, /\/ocr\/$/);
  assert.doesNotMatch(`${options.workerPath} ${options.corePath} ${options.langPath}`, /jsdelivr|unpkg|ocr\.invalid/i);
});

test('ocr session recognizes pages one at a time and can be cancelled', async () => {
  const order = [];
  const session = createOcrSession({
    async renderPage() {
      order.push('render');
      return 'canvas';
    },
    async createWorker() {
      return {
        async recognize(image) {
          order.push(`start:${image}`);
          await new Promise((resolve) => setTimeout(resolve, 20));
          order.push(`end:${image}`);
          return { data: { text: 'Texto reconhecido da pagina' } };
        },
        async terminate() {
          order.push('terminate');
        },
      };
    },
  });
  const first = session.recognize({ pdfPage: { n: 1 } });
  const second = session.recognize({ pdfPage: { n: 2 } });
  const [a, b] = await Promise.all([first, second]);
  assert.equal(a.text.includes('Texto reconhecido'), true);
  assert.equal(b.text.includes('Texto reconhecido'), true);
  assert.deepEqual(order, ['render', 'start:canvas', 'end:canvas', 'render', 'start:canvas', 'end:canvas']);
  await session.cancel();
  await assert.rejects(() => session.recognize({ pdfPage: { n: 3 } }), (error) => error.name === 'AbortError');
  assert.equal(order.at(-1), 'terminate');
});

test('segmentAutos uses the session for a blank page and keeps almost-nothing OCR as a gap', async () => {
  const session = createOcrSession({
    async renderPage(pdfPage) {
      assert.equal(typeof pdfPage.getTextContent, 'function');
      return 'canvas';
    },
    async createWorker() {
      return {
        async recognize() {
          return { data: { text: 'LAUDO extraido da imagem sintetica' } };
        },
        async terminate() {},
      };
    },
  });
  const read = await segmentAutos(makePdf({ pages: [[]] }), {
    ocr: (args) => session.recognize(args),
  });
  assert.equal(read.pages[0].method, 'ocr');
  assert.match(read.pages[0].text, /LAUDO/);
  const pack = buildCasePack(read);
  assert.match(pack, /\[ID pdfp1, pág\. 1\]/);
  assert.match(pack, /\(texto por OCR, pode conter erros\)/);
  assert.match(pack, /\| OCR \|/);

  const thin = await segmentAutos(makePdf({ pages: [[]] }), {
    ocr: async () => ({ text: 'x' }),
  });
  assert.equal(thin.pages[0].hasText, false);
  assert.equal(ocrHasText('x'), false);
  assert.equal(ocrHasText('LAUDO'), true);
  assert.ok('LAUDO'.length >= OCR_MIN_LETTERS);
  assert.match(thin.gaps.find((gap) => gap.page === 1 && gap.reason === 'unreadable_page').detail, /OCR insuficiente/);
});

test('an aborted signal stops before the next page', async () => {
  const controller = new AbortController();
  let calls = 0;
  await assert.rejects(() => segmentAutos(makePdf({ pages: [[], []] }), {
    signal: controller.signal,
    ocr: async () => {
      calls += 1;
      controller.abort();
      return { text: 'Texto longo de OCR da primeira' };
    },
  }), (error) => error.name === 'AbortError');
  assert.equal(calls, 1);
});

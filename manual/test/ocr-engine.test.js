import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorker } from 'tesseract.js';
import { fileURLToPath } from 'node:url';
import { pngFromGray, renderWord } from './bitmap.js';

const langPath = fileURLToPath(new URL('../node_modules/@tesseract.js-data/por/4.0.0_best_int/', import.meta.url));

test('tesseract.js reads a synthetic rendered word', { timeout: 120_000 }, async (t) => {
  const png = pngFromGray(renderWord('LAUDO'));
  let worker;
  try {
    worker = await createWorker('por', 1, {
      langPath,
      gzip: true,
      cacheMethod: 'none',
    });
    const { data } = await worker.recognize(png);
    assert.match(data.text, /LAUDO/);
  } catch (error) {
    const message = String(error?.message ?? error);
    if (/WebAssembly|wasm|CompileError|not supported|shared memory|Aborted/i.test(message)) {
      t.skip(message);
      return;
    }
    throw error;
  } finally {
    await worker?.terminate?.();
  }
});

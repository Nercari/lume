// Local OCR for PDF pages that have no text layer. Assets are files next to the
// page (worker, LSTM wasm glue, Portuguese traineddata). workerBlobURL is false
// so the worker is a same-origin script under the extension CSP
// script-src 'self' 'wasm-unsafe-eval'. Nothing is loaded from a CDN.
import { createWorker } from 'tesseract.js';

export const OCR_ASSETS = Object.freeze({
  worker: 'ocr/worker.min.js',
  coreSimd: 'ocr/tesseract-core-simd-lstm.wasm.js',
  coreFallback: 'ocr/tesseract-core-lstm.wasm.js',
  langDir: 'ocr/',
});

export function ocrPaths(scriptUrl) {
  const base = new URL('.', scriptUrl);
  const href = (path) => new URL(path, base).href;
  return {
    workerPath: href(OCR_ASSETS.worker),
    corePath: href(OCR_ASSETS.coreSimd),
    coreFallback: href(OCR_ASSETS.coreFallback),
    langPath: href(OCR_ASSETS.langDir),
  };
}

export function tesseractOptions(paths, corePath = paths.corePath) {
  return {
    workerPath: paths.workerPath,
    corePath,
    langPath: paths.langPath,
    workerBlobURL: false,
    gzip: true,
    cacheMethod: 'none',
  };
}

export async function createTesseractWorker(paths, factory = createWorker) {
  try {
    return await factory('por', 1, tesseractOptions(paths));
  } catch (error) {
    if (!paths.coreFallback || paths.coreFallback === paths.corePath) throw error;
    return factory('por', 1, tesseractOptions(paths, paths.coreFallback));
  }
}

export async function renderPdfPage(pdfPage, scale = 2) {
  const viewport = pdfPage.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
  return canvas;
}

function abortError() {
  const error = new Error('cancelled');
  error.name = 'AbortError';
  return error;
}

// One worker, one page at a time. createWorker and renderPage are injected so
// node tests can fake both. The real page passes tesseract and renderPdfPage.
export function createOcrSession({ createWorker: factory, renderPage, signal }) {
  let workerPromise = null;
  let cancelled = false;
  let tail = Promise.resolve();

  async function engine() {
    if (cancelled || signal?.aborted) throw abortError();
    if (!workerPromise) {
      workerPromise = Promise.resolve().then(() => factory()).catch((error) => {
        workerPromise = null;
        throw error;
      });
    }
    return workerPromise;
  }

  async function recognizeOne({ pdfPage }) {
    if (cancelled || signal?.aborted) throw abortError();
    const image = await renderPage(pdfPage);
    if (cancelled || signal?.aborted) throw abortError();
    const worker = await engine();
    if (cancelled || signal?.aborted) throw abortError();
    const result = await worker.recognize(image);
    return { text: result?.data?.text ?? result?.text ?? '' };
  }

  return {
    recognize(args) {
      const run = tail.then(() => recognizeOne(args));
      tail = run.then(() => {}, () => {});
      return run;
    },
    async cancel() {
      cancelled = true;
      const pending = workerPromise;
      workerPromise = null;
      if (!pending) return;
      const worker = await pending.catch(() => null);
      await worker?.terminate?.();
    },
  };
}

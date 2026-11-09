import { createOcrSession, createTesseractWorker, renderPdfPage } from '../../manual/src/ocr.js';
import { segmentAutos, setWorkerSrc } from '../../manual/src/segment.js';
import { joinChunks } from './chunks.js';
import { caseViewUrl, renderCaseParts } from './case-view.js';
import { processCollected } from './study-run.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const studyId = params.get('id') ?? '';
const incoming = new Map();
let documents = [];
let finished = false;
const ctrl = new AbortController();

setWorkerSrc(chrome.runtime.getURL('manual/pdf.worker.mjs'));
const ocrBase = chrome.runtime.getURL('manual/');
const paths = {
  workerPath: `${ocrBase}ocr/worker.min.js`,
  corePath: `${ocrBase}ocr/tesseract-core-simd-lstm.wasm.js`,
  coreFallback: `${ocrBase}ocr/tesseract-core-lstm.wasm.js`,
  langPath: `${ocrBase}ocr/`,
};
let workerPromise = null;
function factory() {
  if (!workerPromise) workerPromise = createTesseractWorker(paths);
  return workerPromise;
}
const session = createOcrSession({
  createWorker: factory,
  renderPage: async (page) => (page?.canvas ? page.canvas : renderPdfPage(page)),
  signal: ctrl.signal,
});

function showMisses(misses) {
  $('misses').replaceChildren();
  for (const miss of misses ?? []) {
    const li = document.createElement('li');
    const id = miss.id ? `Id ${miss.id}: ` : '';
    li.textContent = `${id}${miss.detail || miss.reason || 'não encontrado'}`;
    $('misses').append(li);
  }
}

function listParts(parts) {
  $('parts').replaceChildren();
  for (const part of parts) {
    const li = document.createElement('li');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([part.text], { type: 'text/markdown' }));
    link.download = part.name;
    link.textContent = part.name;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = `Copiar parte ${part.n}`;
    copy.addEventListener('click', () => {
      if (!navigator.clipboard?.writeText) return;
      navigator.clipboard.writeText(part.text).then(() => { copy.textContent = 'Copiado'; }).catch(() => {});
    });
    li.append(link, document.createTextNode(' '), copy);
    $('parts').append(li);
  }
  $('save').hidden = parts.length === 0;
  $('preview').textContent = parts.map((part) => part.text).join('\n\n').slice(0, 4000);
}

function saveParts(parts) {
  for (const part of parts) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([part.text], { type: 'text/markdown' }));
    link.download = part.name;
    document.body.append(link);
    link.dispatchEvent(new MouseEvent('click'));
    link.remove();
  }
}

function outcome(kind, text) {
  const result = $('result');
  result.dataset.state = kind;
  result.textContent = text;
}

const port = chrome.runtime.connect({ name: `lume-study:${studyId}` });
let savedParts = [];

$('cancel').addEventListener('click', () => {
  ctrl.abort('user');
  port.postMessage({ type: 'cancel' });
  session.cancel();
  outcome('cancelled', 'Estudo cancelado.');
  $('cancel').disabled = true;
});

$('save').addEventListener('click', () => saveParts(savedParts));

port.onMessage.addListener(async (msg) => {
  if (msg?.type === 'chunk') {
    let bag = incoming.get(msg.index);
    if (!bag) {
      bag = { meta: msg, parts: [] };
      incoming.set(msg.index, bag);
    }
    bag.parts.push({ seq: msg.seq, total: msg.totalChunks, bytes: msg.bytes });
    if (msg.docTotal) $('progress').textContent = `Documento ${msg.docIndex} de ${msg.docTotal}`;
  } else if (msg?.type === 'doc-end') {
    const bag = incoming.get(msg.index);
    if (!bag) return;
    const bytes = joinChunks(bag.parts);
    documents.push({
      id: bag.meta.id,
      version: bag.meta.version,
      contentType: bag.meta.contentType,
      source: bag.meta.source,
      date: bag.meta.date ?? null,
      fetchMs: bag.meta.fetchMs ?? null,
      bytes,
    });
    $('progress').textContent = `Documento ${msg.docIndex ?? documents.length} de ${msg.docTotal ?? '?' } recebido`;
  } else if (msg?.type === 'error') {
    outcome('failed', msg.detail || 'Falha na coleta.');
  } else if (msg?.type === 'done') {
    if (finished) return;
    finished = true;
    showMisses(msg.misses);
    if (ctrl.signal.aborted) return;
    try {
      const bundle = {
        mode: msg.mode,
        misses: msg.misses,
        items: msg.items,
        documents: documents.filter((doc) => doc.source !== 'download-autos'),
        autosDoc: documents.find((doc) => doc.source === 'download-autos') ?? null,
      };
      const started = performance.now();
      const { caseResult, parts, timings } = await processCollected(bundle, {
        signal: ctrl.signal,
        segmentAutos,
        ocrPdfPage: async (pdfPage) => (await session.recognize({ pdfPage })).text ?? '',
        ocrImage: async (bytes) => {
          const bitmap = await createImageBitmap(new Blob([bytes]));
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          canvas.getContext('2d', { willReadFrequently: true }).drawImage(bitmap, 0, 0);
          return (await session.recognize({ pdfPage: { canvas } })).text ?? '';
        },
        onDocument: ({ index, total, id }) => {
          $('progress').textContent = `Documento ${index} de ${total}`;
          $('ocr').textContent = id ? `Id ${id}` : '';
        },
        onOcr: ({ page, pages }) => {
          $('ocr').textContent = `OCR página ${page} de ${pages}`;
        },
      });
      savedParts = parts;
      listParts(parts);
      $('cancel').disabled = true;
      const view = renderCaseParts(caseResult, msg.items ?? []);
      const ocrPerPage = (timings ?? []).flatMap((row) => row.ocrPages ?? []);
      $('measure').textContent = JSON.stringify({
        documents: (timings ?? []).length,
        fetchMs: (timings ?? []).reduce((sum, row) => sum + (row.fetchMs || 0), 0),
        textMs: (timings ?? []).reduce((sum, row) => sum + (row.textMs || 0), 0),
        ocrMs: (timings ?? []).reduce((sum, row) => sum + (row.ocrMs || 0), 0),
        ocrPerPage,
        wallMs: performance.now() - started,
      });
      port.postMessage({ type: 'view', pageUrl: msg.pageUrl ?? null, parts: view.parts, allText: view.allText });
      const viewTarget = caseViewUrl(msg.pageUrl);
      if (viewTarget) {
        try { await chrome.tabs.create({ url: viewTarget }); } catch { /* the study page still lists the files */ }
        outcome('view', 'A aba do PJe mostra o caso inteiro, na ordem da linha do tempo. O painel do ChatGPT lê essa aba. Salvar partes e Copiar parte k estão nesta página.');
      } else {
        outcome('failed', 'Não foi possível abrir a aba do PJe. Use Salvar partes.');
      }
    } catch (error) {
      if (error?.name === 'AbortError' || ctrl.signal.aborted) {
        outcome('cancelled', 'Estudo cancelado.');
        return;
      }
      outcome('failed', 'Não foi possível montar o pacote. Use Salvar partes se os arquivos aparecerem, ou tente de novo.');
    }
  }
});

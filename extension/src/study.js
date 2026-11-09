import { createOcrSession, createTesseractWorker, renderPdfPage } from '../../manual/src/ocr.js';
import { segmentAutos, setWorkerSrc } from '../../manual/src/segment.js';
import { joinChunks } from './chunks.js';
import { DEFAULT_PROJECT_URL, projectUrlOrDefault } from './settings.js';
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
    li.append(link);
    $('parts').append(li);
  }
  const first = parts[0];
  if (!first) return;
  $('save').hidden = false;
  $('save').href = URL.createObjectURL(new Blob([first.text], { type: 'text/markdown' }));
  $('save').download = first.name;
  $('save').textContent = parts.length === 1 ? 'Salvar partes' : `Salvar partes (${first.name})`;
  $('preview').textContent = parts.map((part) => part.text).join('\n\n').slice(0, 4000);
}

function attachFailure(reason) {
  const why = reason === 'timeout' ? 'O ChatGPT não confirmou o anexo a tempo.'
    : reason === 'no-parts' ? 'As partes não chegaram ao ChatGPT.'
      : reason === 'composer-missing' ? 'O compositor do ChatGPT não foi encontrado.'
        : reason === 'attach-threw' ? 'O navegador recusou os arquivos no compositor.'
          : 'Não anexou no ChatGPT.';
  return `${why} Use Anexar no ChatGPT para tentar de novo, ou Salvar partes para baixar os arquivos.`;
}

function outcome(kind, text) {
  const result = $('result');
  result.dataset.state = kind;
  result.textContent = text;
}

async function projectUrl() {
  try {
    const stored = await chrome.storage.local.get('lumeProjectUrl');
    const verdict = projectUrlOrDefault(stored.lumeProjectUrl);
    return verdict.ok ? verdict.url : DEFAULT_PROJECT_URL;
  } catch {
    return DEFAULT_PROJECT_URL;
  }
}

async function openChatGPT() {
  const url = await projectUrl();
  await chrome.tabs.create({ url });
}

const port = chrome.runtime.connect({ name: `lume-study:${studyId}` });

$('cancel').addEventListener('click', () => {
  ctrl.abort('user');
  port.postMessage({ type: 'cancel' });
  session.cancel();
  outcome('cancelled', 'Estudo cancelado.');
  $('cancel').disabled = true;
});

$('retry').addEventListener('click', () => {
  outcome('retrying', 'Tentando anexar no ChatGPT de novo.');
  openChatGPT();
});

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
      const { parts } = await processCollected(bundle, {
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
      listParts(parts);
      $('cancel').disabled = true;
      port.postMessage({ type: 'parts', parts: parts.map((part) => ({ name: part.name, text: part.text })) });
      const attached = new Promise((resolve) => {
        const timer = setTimeout(() => resolve({ ok: false, reason: 'timeout' }), 20000);
        const onMsg = (next) => {
          if (next?.type !== 'attached') return;
          clearTimeout(timer);
          port.onMessage.removeListener(onMsg);
          resolve(next);
        };
        port.onMessage.addListener(onMsg);
      });
      await openChatGPT();
      const result = await attached;
      $('retry').hidden = false;
      if (result.ok) {
        outcome('attached', 'Anexado no ChatGPT. O texto do pedido já está no compositor. Revise e envie você mesmo. O Lume não enviou a mensagem.');
      } else {
        outcome('failed', attachFailure(result.reason));
      }
    } catch (error) {
      if (error?.name === 'AbortError' || ctrl.signal.aborted) {
        outcome('cancelled', 'Estudo cancelado.');
        return;
      }
      outcome('failed', 'Não foi possível montar o pacote. Use Salvar partes se os arquivos aparecerem, ou tente de novo.');
    }
  } else if (msg?.type === 'attached' && finished) {
    $('retry').hidden = false;
    if (msg.ok) outcome('attached', 'Anexado no ChatGPT. O texto do pedido já está no compositor. Revise e envie você mesmo. O Lume não enviou a mensagem.');
    else outcome('failed', attachFailure(msg.reason));
  }
});

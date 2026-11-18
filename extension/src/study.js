import { createOcrSession, createTesseractWorker, renderPdfPage } from '../../manual/src/ocr.js';
import { segmentAutos, setWorkerSrc } from '../../manual/src/segment.js';
import { joinChunks } from './chunks.js';
import { caseViewUrl, renderCaseParts } from './case-view.js';
import { failedTitle, readyTitle, studyingTitle } from './page-trigger.js';
import { processCollected } from './study-run.js';
import { getAccess } from './siwc-client.js';
import { createResponse, listModels, modelPreferenceKey } from './responses.js';
import {
  SIGNED_OUT_TEXT,
  chromeSessionStorage,
  loadMethodTexts,
  presentSigilo,
  runCase,
  statusLine,
} from './run.js';

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const studyId = params.get('id') ?? '';
const attach = params.get('attach');
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
  const sidecar = $('sidecar')?.textContent;
  if (sidecar) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([sidecar], { type: 'application/json' }));
    link.download = 'lume-caso.json';
    document.body.append(link);
    link.dispatchEvent(new MouseEvent('click'));
    link.remove();
  }
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
  if (kind === 'failed') document.title = failedTitle(text);
}

$('result').dataset.attach = attach === '0' || attach == null ? '0' : '0';
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
    if (msg.docTotal) {
      $('progress').textContent = `Documento ${msg.docIndex} de ${msg.docTotal}`;
      document.title = studyingTitle(msg.docIndex, msg.docTotal);
    }
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
    const flagged = msg.sigilo === true || (msg.items ?? []).some((item) => item?.sigilo === true);
    presentSigilo($('sigilo'), flagged);
    if (ctrl.signal.aborted) return;
    try {
      const bundle = {
        mode: msg.mode,
        caseNumber: msg.caseNumber ?? '',
        misses: msg.misses,
        items: msg.items,
        documents: documents.filter((doc) => doc.source !== 'download-autos'),
        autosDoc: documents.find((doc) => doc.source === 'download-autos') ?? null,
      };
      const started = performance.now();
      const { caseResult, timings } = await processCollected(bundle, {
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
      $('cancel').disabled = true;
      const view = renderCaseParts(caseResult, msg.items ?? [], undefined, { processo: msg.caseNumber ?? '' });
      const ocrPerPage = (timings ?? []).flatMap((row) => row.ocrPages ?? []);
      $('measure').textContent = JSON.stringify({
        documents: (timings ?? []).length,
        fetchMs: (timings ?? []).reduce((sum, row) => sum + (row.fetchMs || 0), 0),
        textMs: (timings ?? []).reduce((sum, row) => sum + (row.textMs || 0), 0),
        ocrMs: (timings ?? []).reduce((sum, row) => sum + (row.ocrMs || 0), 0),
        ocrPerPage,
        wallMs: performance.now() - started,
      });
      savedParts = view.parts;
      listParts(view.parts);
      if ($('sidecar')) $('sidecar').textContent = JSON.stringify(view.sidecar);
      document.title = readyTitle({ documents: view.documents, gaps: view.gaps, part: 1, total: view.parts.length || 1 });
      port.postMessage({
        type: 'view',
        pageUrl: msg.pageUrl ?? null,
        parts: view.parts.map((part) => ({ n: part.n, total: part.total, name: part.name, text: part.body })),
        allText: view.allText,
        documents: view.documents,
        gaps: view.gaps,
        header: view.header,
      });
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
      outcome('failed', String(error?.message || 'pacote').slice(0, 60));
    }
  }
});

let runCtrl = null;
let running = false;

function showSignIn() {
  const line = $('signin');
  if (!line) return;
  line.hidden = false;
  line.textContent = SIGNED_OUT_TEXT;
}

async function fillModels(access) {
  const select = $('model');
  if (!select) return;
  const models = await listModels({
    accessToken: access.accessToken,
    getAccess,
    fetchImpl: globalThis.fetch,
  });
  const key = modelPreferenceKey(access.accountId);
  let saved = null;
  try {
    const bag = await chrome.storage.local.get(key);
    saved = bag?.[key] ?? null;
  } catch { /* the list still shows the account catalog */ }
  select.replaceChildren();
  for (const model of models) {
    const option = document.createElement('option');
    option.value = model.slug;
    option.textContent = model.displayName;
    if (model.slug === saved) option.selected = true;
    select.append(option);
  }
  select.addEventListener('change', () => {
    if (!select.value) return;
    chrome.storage.local.set({ [key]: select.value }).catch(() => {});
  });
}

async function readMethod(name) {
  const url = chrome.runtime.getURL(`metodo/${name}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`método ausente: ${name}`);
  return res.text();
}

function paintRun(result) {
  const status = $('run-status');
  if (status) status.textContent = statusLine(result);
  if (result?.status !== 'pronto') return;
  const blocks = [];
  for (const note of result.notes ?? []) blocks.push(note.text);
  if (result.relatorio) blocks.push(result.relatorio);
  if (result.minuta) blocks.push(result.minuta);
  const output = $('output');
  if (output && blocks.length) output.textContent = blocks.join('\n\n');
}

async function startRun(resumeOnly) {
  if (running) return;
  let access = null;
  try { access = await getAccess(); } catch { access = null; }
  if (!access?.ok) {
    showSignIn();
    const status = $('run-status');
    if (status) status.textContent = SIGNED_OUT_TEXT;
    return;
  }
  const signin = $('signin');
  if (signin) signin.hidden = true;
  if (!savedParts.length) {
    const status = $('run-status');
    if (status) status.textContent = 'Espere a leitura do processo.';
    return;
  }
  const model = $('model')?.value ?? '';
  if (!model) {
    const status = $('run-status');
    if (status) status.textContent = 'Escolha um modelo da conta.';
    return;
  }
  try {
    await chrome.storage.local.set({ [modelPreferenceKey(access.accountId)]: model });
  } catch { /* the run does not depend on the saved preference */ }
  running = true;
  runCtrl = new AbortController();
  const output = $('output');
  if (output && !resumeOnly) output.textContent = '';
  try {
    const result = await runCase({
      parts: savedParts,
      model,
      signal: runCtrl.signal,
      storage: chromeSessionStorage(),
      loadMethod: () => loadMethodTexts(readMethod),
      resumeOnly,
      onProgress: (event) => {
        const line = $('run-progress');
        if (!line) return;
        if (event.phase === 'parts') line.textContent = `Parte ${event.part} de ${event.total}`;
        else if (event.phase === 'relatorio') line.textContent = 'Relatório';
        else if (event.phase === 'minuta') line.textContent = 'Minuta';
      },
      onDelta: (delta) => {
        if (output && delta) output.textContent += delta;
      },
      request: (args) => createResponse({ ...args, getAccess, fetchImpl: globalThis.fetch }),
    });
    paintRun(result);
  } catch {
    const status = $('run-status');
    if (status) status.textContent = 'INCOMPLETO';
  } finally {
    running = false;
  }
}

$('gerar')?.addEventListener('click', () => { startRun(false); });
$('retomar')?.addEventListener('click', () => { startRun(true); });
$('cancel-run')?.addEventListener('click', () => { runCtrl?.abort(); });
$('copiar')?.addEventListener('click', () => {
  const text = $('output')?.textContent ?? '';
  if (!navigator.clipboard?.writeText) return;
  navigator.clipboard.writeText(text).then(() => {
    const button = $('copiar');
    if (button) button.textContent = 'Copiado';
  }).catch(() => {});
});

async function probeAccess() {
  try {
    const access = await getAccess();
    if (!access?.ok) {
      showSignIn();
      return;
    }
    const signin = $('signin');
    if (signin) signin.hidden = true;
    await fillModels(access);
  } catch {
    showSignIn();
  }
}

probeAccess();

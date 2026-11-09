import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { checkAnswer } from '../src/check.js';
import { createOcrSession, createTesseractWorker, ocrPaths, renderPdfPage } from '../src/ocr.js';
import { buildCasePack, PACK_FILENAME } from '../src/pack.js';
import { segmentAutos } from '../src/segment.js';
import { segmentText } from '../src/segment-text.js';

const pdfInput = document.querySelector('#pdf');
const textInput = document.querySelector('#text-file');
const paste = document.querySelector('#paste');
const ocrToggle = document.querySelector('#ocr');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const summary = document.querySelector('#summary');
const packBox = document.querySelector('#pack');
const report = document.querySelector('#report');
const verify = document.querySelector('#verify');
const cancel = document.querySelector('#cancel');

let caseResult = null;
let packText = '';
let runId = 0;
let controller = null;
let session = null;
let pasteTimer = 0;

const STATUS_LABEL = {
  exists: 'existe no pacote',
  missing_document: 'id ausente',
  missing_page: 'folha ausente nesse id',
  unreadable: 'folha sem texto (lacuna)',
};

function setStatus(text) {
  status.textContent = text;
}

function showProgress(page, pageCount) {
  progress.classList.remove('hidden');
  progress.max = pageCount || 1;
  progress.value = page;
}

function hideProgress() {
  progress.classList.add('hidden');
  cancel.classList.add('hidden');
}

async function prepareWorker() {
  const workerUrl = new URL('pdf.worker.mjs', import.meta.url);
  GlobalWorkerOptions.workerSrc = workerUrl.href;
  if (location.protocol === 'file:' || location.origin === 'null') {
    // Dynamic on purpose: a static import would be bundled into lume-pdf.js and the
    // separate worker file would not be what file:// loads.
    try {
      globalThis.pdfjsWorker = await import(/* @vite-ignore */ workerUrl.href);
    } catch {
      // pdf.js repeats the load on the main thread when the worker cannot start.
    }
  }
}

if (location.protocol === 'file:' || location.origin === 'null') {
  const note = document.querySelector('#file-note');
  note.textContent = 'Esta página está em file://. O worker de OCR muitas vezes não inicia daí. Abra o pacote pela extensão (chrome-extension://…/manual/lume-pdf.html) ou por um servidor local.';
  note.classList.remove('hidden');
}

async function stopCurrent() {
  controller?.abort();
  const current = session;
  session = null;
  controller = null;
  if (current) await current.cancel();
}

function showPack(result) {
  caseResult = result;
  packText = buildCasePack(result);
  packBox.value = packText;
  summary.classList.remove('hidden');
  verify.disabled = false;
  report.replaceChildren();
  const missing = (result.gaps ?? []).filter((gap) => gap.reason === 'unreadable_page' || gap.reason === 'image_no_text' || gap.reason === 'corrupt_file').length;
  setStatus(`Pacote pronto. ${result.documents.length} peça(s), ${missing} lacuna(s) sem texto.`);
}

async function runPdf(file) {
  const id = ++runId;
  await stopCurrent();
  if (id !== runId) return;
  summary.classList.add('hidden');
  report.replaceChildren();
  showProgress(0, 1);
  cancel.classList.remove('hidden');
  setStatus('Lendo o PDF neste computador…');
  controller = new AbortController();
  const paths = ocrPaths(import.meta.url);
  if (ocrToggle.checked) {
    session = createOcrSession({
      signal: controller.signal,
      renderPage: renderPdfPage,
      createWorker: () => createTesseractWorker(paths),
    });
  }
  let pageCount = 0;
  try {
    await prepareWorker();
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (id !== runId) return;
    const result = await segmentAutos(bytes, {
      signal: controller.signal,
      onProgress({ page, pageCount: total }) {
        pageCount = total;
        showProgress(page, total);
        setStatus(`Lendo página ${page} de ${total}…`);
      },
      ocr: session
        ? async ({ pageNumber, pdfPage }) => {
          setStatus(`OCR página ${pageNumber} de ${pageCount}`);
          return session.recognize({ pageNumber, pdfPage });
        }
        : undefined,
    });
    if (id !== runId) return;
    hideProgress();
    if (result.gaps.some((gap) => gap.reason === 'corrupt_file')) {
      setStatus('O arquivo não pôde ser lido como PDF.');
      return;
    }
    showPack(result);
  } catch (error) {
    if (id !== runId) return;
    hideProgress();
    if (controller?.signal.aborted || error?.name === 'AbortError') setStatus('OCR cancelado.');
    else setStatus('A leitura falhou neste computador. O arquivo não foi enviado.');
  } finally {
    if (id === runId) hideProgress();
  }
}

function runText(text) {
  const id = ++runId;
  controller?.abort();
  session?.cancel();
  session = null;
  controller = null;
  hideProgress();
  report.replaceChildren();
  const result = segmentText(text);
  if (id !== runId) return;
  if (!result.documents.length && result.gaps.some((gap) => gap.reason === 'empty_text')) {
    summary.classList.add('hidden');
    setStatus('O texto está vazio.');
    return;
  }
  showPack(result);
}

async function copyText(text, button) {
  const previous = button.textContent;
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    document.body.append(area);
    area.select();
    document.execCommand('copy');
    area.remove();
  }
  button.textContent = 'Copiado';
  setTimeout(() => { button.textContent = previous; }, 1200);
}

pdfInput.addEventListener('change', () => {
  const file = pdfInput.files?.[0];
  if (file) runPdf(file);
});

textInput.addEventListener('change', async () => {
  const file = textInput.files?.[0];
  if (!file) return;
  setStatus('Lendo o texto neste computador…');
  runText(await file.text());
});

paste.addEventListener('input', () => {
  clearTimeout(pasteTimer);
  pasteTimer = setTimeout(() => {
    if (paste.value.trim()) runText(paste.value);
  }, 400);
});

cancel.addEventListener('click', () => {
  runId += 1;
  stopCurrent();
  hideProgress();
  setStatus('OCR cancelado.');
});

document.querySelector('#download').addEventListener('click', () => {
  if (!packText) return;
  const blob = new Blob([packText], { type: 'text/markdown;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = PACK_FILENAME;
  link.click();
  URL.revokeObjectURL(link.href);
});

document.querySelector('#copy-pack').addEventListener('click', (event) => {
  if (packText) copyText(packText, event.currentTarget);
});

verify.addEventListener('click', () => {
  if (!caseResult) return;
  const result = checkAnswer(document.querySelector('#answer').value, caseResult);
  report.replaceChildren();
  const head = document.createElement('p');
  head.textContent = result.ok
    ? 'Nenhuma citação apontou para id ou folha ausente, e nenhuma frase decisiva ficou sem citação. Isso não confirma o acerto do texto.'
    : 'Há citação para id ou folha ausente, ou frase decisiva sem citação. Isso não confirma o acerto do que foi citado.';
  report.append(head);
  if (result.citations.length) {
    const list = document.createElement('ul');
    for (const citation of result.citations) {
      const item = document.createElement('li');
      item.textContent = `${citation.raw} — ${STATUS_LABEL[citation.status] ?? citation.status}`;
      list.append(item);
    }
    report.append(list);
  } else {
    const none = document.createElement('p');
    none.textContent = 'Nenhuma citação no formato [Id …, fl. …] ou [Id …, p. …].';
    report.append(none);
  }
  if (result.uncitedDecisive.length) {
    const title = document.createElement('p');
    title.textContent = 'Frases decisivas sem citação:';
    const list = document.createElement('ul');
    for (const sentence of result.uncitedDecisive) {
      const item = document.createElement('li');
      item.textContent = sentence.text;
      list.append(item);
    }
    report.append(title, list);
  }
});

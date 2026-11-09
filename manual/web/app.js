import { GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { checkAnswer } from '../src/check.js';
import { buildChatGPTPackage, DOC_TYPE_OPTIONS } from '../src/prompt.js';
import { segmentAutos } from '../src/segment.js';

const SIGNAL_LABEL = { footer: 'rodapé', outline: 'marcador', index: 'índice' };

const pdfInput = document.querySelector('#pdf');
const docType = document.querySelector('#doc-type');
const request = document.querySelector('#request');
const limit = document.querySelector('#limit');
const status = document.querySelector('#status');
const progress = document.querySelector('#progress');
const summary = document.querySelector('#summary');
const counts = document.querySelector('#counts');
const ocrNote = document.querySelector('#ocr-note');
const docs = document.querySelector('#docs');
const partsBox = document.querySelector('#parts');
const report = document.querySelector('#report');
const verify = document.querySelector('#verify');

let caseResult = null;
let packaged = null;

for (const option of DOC_TYPE_OPTIONS) {
  const node = document.createElement('option');
  node.value = option.id;
  node.textContent = option.label;
  if (option.id === 'decisao') node.selected = true;
  docType.append(node);
}

function setStatus(text) {
  status.textContent = text;
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

function addCount(term, value) {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  counts.append(dt, dd);
}

function pieceCounts(result) {
  const tally = new Map();
  for (const doc of result.documents) {
    tally.set(doc.piece, (tally.get(doc.piece) ?? 0) + 1);
  }
  if (!tally.size) return 'nenhum';
  return [...tally.entries()].map(([piece, count]) => `${piece}: ${count}`).join('; ');
}

function renderPackage() {
  if (!caseResult) return;
  const charLimit = Number(limit.value);
  try {
    packaged = buildChatGPTPackage(caseResult, {
      docType: docType.value,
      request: request.value,
      charLimit: Number.isInteger(charLimit) ? charLimit : 24_000,
    });
  } catch (error) {
    packaged = null;
    setStatus(error instanceof RangeError ? 'O limite de cada parte precisa ser um inteiro de pelo menos 500.' : 'Não foi possível montar o pacote.');
    return;
  }
  partsBox.replaceChildren();
  packaged.parts.forEach((part, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'secondary';
    button.textContent = packaged.parts.length === 1
      ? 'Copiar arquivo do processo'
      : `Copiar parte ${index + 1} de ${packaged.parts.length}`;
    button.addEventListener('click', () => copyText(part, button));
    partsBox.append(button);
  });
}

function renderSummary(result) {
  const ocrPages = result.gaps.filter((gap) => gap.reason === 'unreadable_page');
  counts.replaceChildren();
  addCount('Páginas', String(result.pageCount));
  addCount('Páginas com texto', String(result.pages.filter((page) => page.hasText).length));
  addCount('Documentos encontrados', String(result.documents.length));
  addCount('Tipos de peça', pieceCounts(result));
  addCount('Páginas que precisam de OCR', String(ocrPages.length));
  ocrNote.replaceChildren();
  if (ocrPages.length) {
    const note = document.createElement('p');
    note.className = 'warn';
    note.textContent = `Precisa OCR nas páginas ${ocrPages.map((gap) => gap.page).join(', ')} do PDF. O texto delas não entrou no arquivo.`;
    ocrNote.append(note);
  }
  docs.replaceChildren();
  for (const doc of result.documents) {
    const tr = document.createElement('tr');
    for (const value of [
      doc.docId,
      doc.piece,
      doc.startPage === doc.endPage ? String(doc.startPage) : `${doc.startPage}–${doc.endPage}`,
      doc.signals.map((signal) => SIGNAL_LABEL[signal] ?? signal).join(', ') || '—',
    ]) {
      const td = document.createElement('td');
      td.textContent = value;
      tr.append(td);
    }
    docs.append(tr);
  }
  summary.classList.remove('hidden');
  verify.disabled = false;
  renderPackage();
}

pdfInput.addEventListener('change', async () => {
  const file = pdfInput.files?.[0];
  report.replaceChildren();
  if (!file) return;
  summary.classList.add('hidden');
  progress.classList.remove('hidden');
  progress.value = 0;
  setStatus('Lendo o PDF neste computador…');
  try {
    await prepareWorker();
    const bytes = new Uint8Array(await file.arrayBuffer());
    caseResult = await segmentAutos(bytes, {
      onProgress({ page, pageCount }) {
        progress.max = pageCount;
        progress.value = page;
        setStatus(`Lendo página ${page} de ${pageCount}…`);
      },
    });
    progress.classList.add('hidden');
    if (caseResult.gaps.some((gap) => gap.reason === 'corrupt_file')) {
      setStatus('O arquivo não pôde ser lido como PDF.');
      return;
    }
    setStatus(`Leitura local concluída. ${caseResult.pageCount} página(s).`);
    renderSummary(caseResult);
  } catch {
    progress.classList.add('hidden');
    setStatus('A leitura falhou neste computador. O arquivo não foi enviado.');
  }
});

docType.addEventListener('change', renderPackage);
request.addEventListener('input', renderPackage);
limit.addEventListener('change', renderPackage);

document.querySelector('#copy-prompt').addEventListener('click', (event) => {
  if (packaged) copyText(packaged.prompt, event.currentTarget);
});

document.querySelector('#download').addEventListener('click', () => {
  if (!packaged) return;
  const blob = new Blob([packaged.caseFile], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'processo.txt';
  link.click();
  URL.revokeObjectURL(link.href);
});

const STATUS_LABEL = {
  exists: 'existe no PDF',
  missing_document: 'id ausente',
  missing_page: 'página ausente nesse id',
  unreadable: 'página sem texto (precisa OCR)',
};

verify.addEventListener('click', () => {
  if (!caseResult) return;
  const result = checkAnswer(document.querySelector('#answer').value, caseResult);
  report.replaceChildren();
  const head = document.createElement('p');
  head.textContent = result.ok
    ? 'Nenhuma citação apontou para fora do PDF, e nenhuma frase decisiva ficou sem citação. Isso não confirma o acerto do texto.'
    : 'Há citação fora do PDF ou frase decisiva sem citação. Isso não confirma o acerto do que foi citado.';
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
    none.textContent = 'Nenhuma citação no formato [Id …, p. …].';
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

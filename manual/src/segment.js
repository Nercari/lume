// Segment one merged PJe autos PDF. Any subset of index, outline and footer may be present.
// A page with no text layer becomes an unreadable_page gap ("precisa OCR"). OCR is an
// injected callback; this package does not ship an OCR engine or language data.
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { classifyFromHeadings, classifyPiece, documentTypeSource } from './classify.js';
import {
  headingLinesFromPage,
  isIndexHeader,
  matchPageFooter,
  parseIndexRow,
  parseOutlineTitle,
} from './rules.js';

export const GAP = Object.freeze({
  unreadable_page: 'unreadable_page',
  corrupt_file: 'corrupt_file',
  no_document_signal: 'no_document_signal',
  footer_id_conflict: 'footer_id_conflict',
  footer_missing_id: 'footer_missing_id',
  index_unplaced: 'index_unplaced',
});

export function passageIdFor(docId, version, pageInDoc, pdfPage) {
  if (!docId) return null;
  if (pageInDoc != null) return `${docId}@${version}:p${pageInDoc}`;
  return `${docId}@${version}:pdf${pdfPage}`;
}

const SIGNAL_ORDER = ['footer', 'outline', 'index', 'heading'];

export function setWorkerSrc(src) {
  if (typeof src !== 'string' || !src) throw new TypeError('workerSrc must be a URL string');
  GlobalWorkerOptions.workerSrc = src;
}

export function cleanVersion(version) {
  const text = String(version ?? '1').trim();
  return /^[A-Za-z0-9._-]{1,32}$/.test(text) ? text : '1';
}

function emptyResult(version, gap) {
  return { version, pageCount: 0, pages: [], documents: [], passages: [], gaps: [gap] };
}

function isPdfDocument(input) {
  return Boolean(input) && typeof input === 'object' && typeof input.numPages === 'number' && typeof input.getPage === 'function';
}

function lineText(items) {
  const sorted = [...items].sort((a, b) => a.x - b.x);
  let out = '';
  let lastEnd = null;
  for (const item of sorted) {
    if (lastEnd != null && item.x - lastEnd > 1) out += ' ';
    out += item.str;
    lastEnd = item.x + (item.width || 0);
  }
  return out.replace(/\s+/g, ' ').trim();
}

function linesFromContent(content) {
  const rows = [];
  for (const item of content?.items ?? []) {
    if (typeof item.str !== 'string' || !item.str.trim()) continue;
    const x = item.transform?.[4] ?? 0;
    const y = item.transform?.[5] ?? 0;
    let row = rows.find((candidate) => Math.abs(candidate.y - y) < 3);
    if (!row) {
      row = { y, items: [] };
      rows.push(row);
    }
    row.items.push({ x, str: item.str, width: item.width || 0 });
  }
  rows.sort((a, b) => b.y - a.y);
  return rows.map((row) => ({ y: row.y, text: lineText(row.items) })).filter((row) => row.text);
}

function charCount(lines) {
  return lines.reduce((sum, line) => sum + line.text.replace(/\s/g, '').length, 0);
}

async function readOutline(pdf) {
  let raw;
  try {
    raw = await pdf.getOutline();
  } catch {
    return [];
  }
  if (!raw) return [];
  const out = [];
  const walk = async (items) => {
    for (const item of items ?? []) {
      const parsed = parseOutlineTitle(item?.title);
      const page = await pageOfDest(pdf, item?.dest);
      if (parsed) out.push({ ...parsed, page });
      if (item?.items?.length) await walk(item.items);
    }
  };
  await walk(raw);
  return out;
}

async function pageOfDest(pdf, dest) {
  if (!dest) return null;
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    if (!Array.isArray(explicit) || explicit[0] == null) return null;
    return (await pdf.getPageIndex(explicit[0])) + 1;
  } catch {
    return null;
  }
}

function parseIndex(pages) {
  const rows = [];
  const indexPages = new Set();
  let carry = false;
  for (const page of pages) {
    let onHeaderPage = false;
    let rowOnPage = false;
    for (const line of page.lines) {
      if (isIndexHeader(line.text)) {
        onHeaderPage = true;
        carry = true;
        indexPages.add(page.n);
        continue;
      }
      if (!onHeaderPage && !carry) continue;
      const row = parseIndexRow(line.text);
      // A prose line ends the table. Later pages do not stay open.
      if (!row) {
        onHeaderPage = false;
        carry = false;
        continue;
      }
      rows.push(row);
      rowOnPage = true;
      indexPages.add(page.n);
    }
    if (!onHeaderPage && !rowOnPage) carry = false;
  }
  return { rows, indexPages };
}

function metaFor(meta, docId) {
  if (!meta.has(docId)) meta.set(docId, { title: null, rawType: null, signals: new Set(), weak: false });
  return meta.get(docId);
}

function assignPages(pages, outlines, indexPages, gaps) {
  const owner = Array(pages.length + 1).fill(null);
  const meta = new Map();

  for (const page of pages) {
    if (!page.footer?.docId) continue;
    owner[page.n] = page.footer.docId;
    metaFor(meta, page.footer.docId).signals.add('footer');
  }

  const outlineSorted = outlines.filter((item) => item.page).sort((a, b) => a.page - b.page);
  for (let i = 0; i < outlineSorted.length; i++) {
    const item = outlineSorted[i];
    const existing = owner[item.page];
    if (!item.docId && existing) {
      const record = metaFor(meta, existing);
      record.signals.add('outline');
      if (item.title && !record.title) record.title = item.title;
      continue;
    }
    const docId = item.docId || existing || `contorno-${item.page}`;
    const record = metaFor(meta, docId);
    record.signals.add('outline');
    if (item.title && !record.title) record.title = item.title;
    if (existing && item.docId && existing !== item.docId) {
      const kept = metaFor(meta, existing);
      kept.signals.add('outline');
      if (item.title && !kept.title) kept.title = item.title;
      continue;
    }
    if (existing) continue;
    const nextOutline = outlineSorted[i + 1]?.page ?? pages.length + 1;
    for (let n = item.page; n <= pages.length && n < nextOutline; n++) {
      if (owner[n]) break;
      owner[n] = docId;
    }
  }

  for (const n of indexPages) {
    if (owner[n]) metaFor(meta, owner[n]).signals.add('index');
    else {
      owner[n] = 'indice';
      const record = metaFor(meta, 'indice');
      record.signals.add('index');
      if (!record.title) record.title = 'Índice';
    }
  }

  // A scanned page keeps the previous piece. The index does not swallow the pages after it:
  // those stay unassigned until a footer or an outline claims them.
  let current = null;
  for (let n = 1; n <= pages.length; n++) {
    if (owner[n]) {
      if (owner[n] !== 'indice') current = owner[n];
      continue;
    }
    if (current) owner[n] = current;
  }

  for (let n = 1; n <= pages.length; n++) {
    if (owner[n]) continue;
    const docId = `pdfp${n}`;
    owner[n] = docId;
    const record = metaFor(meta, docId);
    record.weak = true;
    gaps.push({
      reason: GAP.footer_missing_id,
      page: n,
      docId,
      detail: 'rodapé sem Num./Pág.',
    });
  }

  return { owner, meta };
}

function applyIndexRows(meta, rows, gaps) {
  for (const row of rows) {
    const record = meta.get(row.docId);
    if (!record) {
      gaps.push({
        reason: GAP.index_unplaced,
        page: null,
        docId: row.docId,
        detail: 'id do índice sem páginas locais',
      });
      continue;
    }
    record.signals.add('index');
    record.title = row.title;
    record.rawType = row.type;
  }
}

function pageInDocOf(pages, docId, numbers) {
  const assigned = [];
  let next = null;
  for (const n of numbers) {
    const footer = pages[n - 1].footer;
    let pageInDoc = null;
    if (footer?.docId === docId && footer.pageInDoc != null) {
      pageInDoc = footer.pageInDoc;
      next = pageInDoc + 1;
    } else if (next != null) {
      pageInDoc = next;
      next += 1;
    }
    assigned.push(pageInDoc);
  }
  return assigned;
}

function buildDocuments(pages, owner, meta, version, gaps) {
  const order = [];
  const seen = new Set();
  for (let n = 1; n <= pages.length; n++) {
    const docId = owner[n];
    if (!docId || seen.has(docId)) continue;
    seen.add(docId);
    order.push(docId);
  }

  const documents = [];
  const pageInfo = new Map();
  for (const docId of order) {
    const record = meta.get(docId);
    const numbers = [];
    for (let n = 1; n <= pages.length; n++) if (owner[n] === docId) numbers.push(n);
    const inDoc = pageInDocOf(pages, docId, numbers);
    let piece = docId === 'indice' || record.weak
      ? 'outros'
      : classifyPiece([record.title, record.rawType].filter(Boolean).join('\n'));
    let typeSource;
    if (record.rawType && record.signals.has('index') && piece !== 'outros') {
      typeSource = 'index';
    } else if (record.title && record.signals.has('outline') && piece !== 'outros') {
      typeSource = 'outline';
    } else if (piece === 'outros' && docId !== 'indice' && !record.weak && numbers.length) {
      const firstPage = pages[numbers[0] - 1];
      const headings = headingLinesFromPage(firstPage.lines, firstPage.height);
      const fromHeading = classifyFromHeadings(headings);
      if (fromHeading.piece !== 'outros') {
        piece = fromHeading.piece;
        record.signals.add('heading');
        typeSource = 'heading';
        if (fromHeading.weak) record.headingWeak = true;
      } else {
        typeSource = 'none';
      }
    } else {
      typeSource = piece === 'outros' ? 'none' : (record.signals.has('index') ? 'index' : 'outline');
    }

    documents.push({
      docId,
      title: record.title,
      type: record.rawType,
      piece,
      typeSource,
      headingWeak: record.headingWeak === true,
      startPage: numbers[0],
      endPage: numbers[numbers.length - 1],
      pages: numbers,
      signals: SIGNAL_ORDER.filter((signal) => record.signals.has(signal)),
      version,
    });
    numbers.forEach((n, index) => {
      pageInfo.set(n, { docId, pageInDoc: inDoc[index] });
    });
    if (record.weak && !docId.startsWith('pdfp')) {
      gaps.push({
        reason: GAP.no_document_signal,
        page: numbers[0],
        docId,
        detail: 'sem rodapé, contorno ou índice',
      });
    }
  }
  return { documents, pageInfo };
}

async function loadPages(pdf, options) {
  const pages = [];
  for (let n = 1; n <= pdf.numPages; n++) {
    options.onProgress?.({ page: n, pageCount: pdf.numPages });
    const pdfPage = await pdf.getPage(n);
    const viewport = pdfPage.getViewport({ scale: 1 });
    let lines = linesFromContent(await pdfPage.getTextContent());
    let method = 'pdf-text';
    if (charCount(lines) === 0 && options.ocr) {
      try {
        const result = await options.ocr({ pageNumber: n, pdfPage });
        const text = String(result?.text ?? '').trim();
        if (text) {
          lines = text.split(/\n/).map((row) => ({ y: null, text: row.trim() })).filter((row) => row.text);
          method = 'ocr';
        }
      } catch {
        lines = [];
      }
    }
    const chars = charCount(lines);
    const footer = chars ? matchPageFooter(lines, viewport.height) : null;
    pages.push({
      n,
      lines,
      chars,
      hasText: chars > 0,
      method: chars > 0 ? method : null,
      footer,
      height: viewport.height,
    });
  }
  return pages;
}

async function segmentPdf(pdf, options) {
  const version = cleanVersion(options.version);
  const loaded = await loadPages(pdf, options);
  const gaps = [];
  for (const page of loaded) {
    if (page.footer?.conflict) {
      gaps.push({
        reason: GAP.footer_id_conflict,
        page: page.n,
        docId: page.footer.docId,
        detail: 'regras de rodapé divergiram',
      });
    }
  }
  const outlines = await readOutline(pdf);
  const index = parseIndex(loaded);
  const { owner, meta } = assignPages(loaded, outlines, index.indexPages, gaps);
  applyIndexRows(meta, index.rows, gaps);
  const { documents, pageInfo } = buildDocuments(loaded, owner, meta, version, gaps);

  const pages = [];
  const passages = [];
  for (const page of loaded) {
    const info = pageInfo.get(page.n) ?? { docId: null, pageInDoc: null };
    const passageId = passageIdFor(info.docId, version, info.pageInDoc, page.n);
    const text = page.lines.map((line) => line.text).join('\n');
    const footer = page.footer ? {
      docId: page.footer.docId,
      pageInDoc: page.footer.pageInDoc,
      docNumber: page.footer.docNumber ?? null,
    } : null;
    const record = {
      n: page.n,
      hasText: page.hasText,
      chars: page.chars,
      footer,
      docId: info.docId,
      pageInDoc: info.pageInDoc,
      passageId,
      method: page.method,
      text,
    };
    pages.push(record);
    if (passageId) {
      passages.push({
        id: passageId,
        docId: info.docId,
        version,
        pageInDoc: info.pageInDoc,
        pdfPage: page.n,
        text,
        method: page.method,
        hasText: page.hasText,
      });
    }
    if (!page.hasText) {
      gaps.push({
        reason: GAP.unreadable_page,
        page: page.n,
        docId: info.docId,
        pageInDoc: info.pageInDoc,
        passageId,
        detail: 'precisa OCR',
      });
    }
  }

  return { version, pageCount: loaded.length, pages, documents, passages, gaps };
}

export async function segmentAutos(input, options = {}) {
  const version = cleanVersion(options.version);
  if (isPdfDocument(input)) return segmentPdf(input, { ...options, version });
  let bytes;
  try {
    bytes = input instanceof Uint8Array ? new Uint8Array(input) : new Uint8Array(input);
  } catch {
    return emptyResult(version, { reason: GAP.corrupt_file, page: null, detail: 'arquivo PDF ilegível' });
  }
  if (!bytes.byteLength) return emptyResult(version, { reason: GAP.corrupt_file, page: null, detail: 'arquivo PDF ilegível' });
  const task = getDocument({ data: bytes, verbosity: 0, isEvalSupported: false, stopAtErrors: true });
  try {
    const pdf = await task.promise;
    try {
      return await segmentPdf(pdf, { ...options, version });
    } finally {
      await task.destroy();
    }
  } catch {
    await task.destroy().catch(() => {});
    return emptyResult(version, { reason: GAP.corrupt_file, page: null, detail: 'arquivo PDF ilegível' });
  }
}

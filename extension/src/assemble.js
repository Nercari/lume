// Turns collected bytes into the caseResult shape buildCasePack already reads.
// The document id is the timeline id. pág. do documento is set only when the
// file says it (a footer, or a one-page HTML or image). The PDF page index is
// separate and is never copied into the document page.

import { classifyPiece } from '../../manual/src/classify.js';

export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

function pageRecord(doc, page, index, n) {
  const text = String(page.text ?? '').trim();
  const hasText = text.length > 0;
  const pageInDoc = page.pageInDoc ?? null;
  const pdfPage = page.pdfPage ?? null;
  return {
    n,
    docId: String(doc.id),
    pageInDoc,
    pdfPage,
    hasText,
    method: hasText ? (page.method === 'ocr' ? 'ocr' : 'text') : null,
    text,
    chars: text.length,
  };
}

export function caseFromDocuments(documents, extraGaps = []) {
  const pages = [];
  const docs = [];
  const gaps = [];
  const passages = [];
  let n = 0;
  for (const doc of documents) {
    const docPages = [];
    const bodies = [];
    const own = doc.pages ?? [];
    own.forEach((page, index) => {
      n += 1;
      const record = pageRecord(doc, page, index, n);
      pages.push(record);
      docPages.push(n);
      bodies.push(record.text);
      passages.push({
        id: `${doc.id}@${doc.version || '1'}:p${record.pageInDoc}`,
        docId: String(doc.id),
        version: doc.version || '1',
        pageInDoc: record.pageInDoc,
        pdfPage: record.pdfPage,
        text: record.text,
        method: record.method,
        hasText: record.hasText,
      });
      if (!record.hasText) {
        gaps.push({
          reason: 'unreadable_page',
          docId: String(doc.id),
          page: n,
          pageInDoc: record.pageInDoc,
          pdfPage: record.pdfPage,
          detail: page.detail || 'ilegível',
        });
      }
    });
    for (const gap of doc.gaps ?? []) {
      gaps.push({ ...gap, docId: gap.docId ?? String(doc.id) });
    }
    docs.push({
      docId: String(doc.id),
      title: null,
      piece: classifyPiece(bodies.join('\n')),
      pages: docPages,
      version: doc.version || '1',
      date: doc.date ?? null,
      kind: doc.kind ?? null,
    });
  }
  for (const gap of extraGaps) gaps.push(gap);
  return { origin: 'pje', version: '1', pageCount: n, pages, documents: docs, passages, gaps };
}

export function mergeAutos(segmented, listItems) {
  const gaps = [...(segmented?.gaps ?? [])];
  const have = new Set((segmented?.documents ?? []).map((doc) => String(doc.docId)));
  for (const item of listItems ?? []) {
    if (item?.id == null || have.has(String(item.id))) continue;
    gaps.push({
      reason: 'unreadable_page',
      docId: String(item.id),
      page: null,
      pageInDoc: null,
      detail: 'id da lista ausente no PDF dos autos',
    });
  }
  return { ...segmented, origin: 'pje', gaps };
}

export function gapsFromMisses(misses) {
  const gaps = [];
  const seen = new Set();
  for (const miss of misses ?? []) {
    if (miss?.id == null || seen.has(String(miss.id))) continue;
    seen.add(String(miss.id));
    gaps.push({
      reason: miss.reason === 'unsupported' ? 'corrupt_file' : 'unreadable_page',
      docId: String(miss.id),
      page: null,
      pageInDoc: null,
      detail: miss.detail || miss.reason,
    });
  }
  return gaps;
}

function timingOf(textMs, ocrPages) {
  const ocrMs = ocrPages.reduce((sum, page) => sum + page.ms, 0);
  return { textMs, ocrMs, ocrPages };
}

export async function ingestOne(doc, deps) {
  const type = String(doc.contentType ?? '').split(';')[0].trim().toLowerCase();
  const base = { id: doc.id, version: doc.version || '1', date: doc.date ?? null };
  if (type === 'text/html' || type === 'text/plain') {
    const started = performance.now();
    const text = type === 'text/plain'
      ? new TextDecoder().decode(doc.bytes).trim()
      : htmlToText(new TextDecoder().decode(doc.bytes));
    return {
      ...base,
      kind: 'text',
      timing: timingOf(performance.now() - started, []),
      pages: [{ pageInDoc: 1, pdfPage: 1, text, method: 'text', detail: text ? null : 'sem texto' }],
    };
  }
  if (type === 'application/pdf') {
    const ocrPages = [];
    const started = performance.now();
    const segmented = await deps.segmentAutos(doc.bytes, {
      version: doc.version || '1',
      signal: deps.signal,
      ocr: async (info) => {
        deps.onOcr?.({ page: info.pageNumber, pages: info.pageCount, docId: doc.id });
        const ocrStarted = performance.now();
        const text = await deps.ocrPdfPage(info.pdfPage);
        ocrPages.push({ page: info.pageNumber, ms: performance.now() - ocrStarted });
        return { text };
      },
    });
    const ocrMs = ocrPages.reduce((sum, page) => sum + page.ms, 0);
    const pages = (segmented.pages ?? []).map((page, index) => ({
      pageInDoc: page.pageInDoc ?? null,
      pdfPage: page.n ?? index + 1,
      text: page.text ?? '',
      method: page.method === 'ocr' ? 'ocr' : 'text',
      detail: page.hasText ? null : 'ilegível',
    }));
    return { ...base, kind: 'pdf', timing: timingOf(Math.max(0, performance.now() - started - ocrMs), ocrPages), pages };
  }
  if (type === 'image/jpeg' || type === 'image/png' || type === 'image/tiff' || type === 'image/tif') {
    deps.onOcr?.({ page: 1, pages: 1, docId: doc.id });
    const ocrStarted = performance.now();
    let text = '';
    try {
      text = String(await deps.ocrImage(doc.bytes) ?? '');
    } catch (error) {
      if (error?.name === 'AbortError') throw error;
      const ms = performance.now() - ocrStarted;
      return { ...base, kind: 'image', timing: timingOf(0, [{ page: 1, ms }]), pages: [{ pageInDoc: 1, pdfPage: 1, text: '', method: 'ocr', detail: 'ilegível' }] };
    }
    const ms = performance.now() - ocrStarted;
    const readable = text.trim();
    return {
      ...base,
      kind: 'image',
      timing: timingOf(0, [{ page: 1, ms }]),
      pages: [{ pageInDoc: 1, pdfPage: 1, text: readable, method: 'ocr', detail: readable ? null : 'ilegível' }],
    };
  }
  return {
    ...base,
    kind: 'binary',
    timing: timingOf(0, []),
    pages: [],
    gaps: [{ reason: 'corrupt_file', docId: String(doc.id), detail: type || 'tipo desconhecido' }],
  };
}

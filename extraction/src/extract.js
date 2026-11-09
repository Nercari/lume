// Extraction core (#2). Every readable passage carries its provenance; everything else becomes
// an explicit gap record. One document's failure never touches another document's result.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { recognize, DEFAULT_THRESHOLD } from './ocr.js';

export const GAP_REASONS = Object.freeze([
  'restricted', // the inventory marks the item restricted; Lume does not read it
  'missing', // the inventory has no readable item (no link, 404, 410)
  'fetch_failed', // the inventory or the download reports a failure
  'not_read', // the inventory item was never read (pending)
  'unsupported_media', // a media type Lume does not extract
  'corrupt_file', // the file cannot be parsed
  'unreadable_page', // a page without a text layer and without OCR text
  'page_failed', // one page threw during extraction
  'ocr_failed', // the OCR engine threw on a page
  'page_count_mismatch', // the file has fewer pages than the inventory expects
  'extraction_error', // an unexpected error inside Lume's extractor for this document
  'excluded_from_transmission', // policy keeps this text out of model calls
]);

const PDF = 'application/pdf';
const IMAGES = ['image/png', 'image/jpeg', 'image/tiff', 'image/x-fake'];
const HTML = 'text/html';

const INVENTORY_GAP = { restricted: 'restricted', missing: 'missing', failed: 'fetch_failed', pending: 'not_read', unsupported: 'unsupported_media' };

export const gap = (docId, version, page, reason, detail = null) => ({ docId, version, page, reason, detail });

const baseType = (t) => (t ?? '').split(';')[0].trim().toLowerCase();

// Joins one page's passages into page text and fills in their offsets in that text.
function buildPage(docId, version, page, raw, method) {
  let text = '';
  const passages = [];
  for (const r of raw) {
    if (!r.text.trim()) continue;
    if (text) text += '\n';
    const start = text.length;
    text += r.text;
    const confidence = r.confidence ?? null;
    passages.push({
      id: `${docId}@${version}:p${page}:${start}-${text.length}`,
      docId, version, page, start, end: text.length, text: r.text,
      region: r.region ?? null, method, confidence,
      lowConfidence: r.lowConfidence ?? false,
    });
  }
  return { page, method, text, passages };
}

// Text layer of one PDF page as raw passages. Region is [x, y, width, height] in PDF units.
async function pdfTextLines(pdfPage) {
  const { items } = await pdfPage.getTextContent();
  return items.filter((i) => typeof i.str === 'string').map((i) => ({
    text: i.str,
    region: [i.transform[4], i.transform[5], i.width, i.height],
  }));
}

async function ocrPage(ctx, docId, version, page, image) {
  const res = await recognize(ctx.ocr, image, ctx.threshold);
  return buildPage(docId, version, page, res.lines, `ocr:${ctx.ocr.id}`);
}

// Extracts one document. ctx: { ocr?, renderPage?(pdfPage, n), threshold }. Never throws for bad input.
export async function extractDocument(item, file, ctx = {}) {
  const out = await extractFile(item, file, ctx);
  // A file shorter than the inventory says is a visible gap per missing page, for every media type.
  if (out.expectedPages != null && out.pageCount && out.pageCount < out.expectedPages) {
    for (let n = out.pageCount + 1; n <= out.expectedPages; n++) out.gaps.push(gap(out.docId, out.version, n, 'page_count_mismatch', `file has ${out.pageCount} of ${out.expectedPages} pages`));
  }
  return out;
}

async function extractFile(item, file, ctx) {
  ctx = { threshold: DEFAULT_THRESHOLD, ...ctx };
  const { id: docId, version } = item;
  const out = { docId, version, kind: item.kind ?? 'document', href: item.href ?? null, expectedPages: item.expectedPages ?? null, pageCount: 0, pages: [], gaps: [], images: [] };
  const docGap = (reason, detail) => (out.gaps.push(gap(docId, version, null, reason, detail)), out);
  const type = baseType(file?.contentType ?? item.contentType);

  if (IMAGES.includes(type)) {
    out.pageCount = 1;
    if (!ctx.ocr) return (out.gaps.push(gap(docId, version, 1, 'unreadable_page', 'scan; no OCR engine configured')), out);
    out.images.push({ page: 1, bytes: file.bytes, mime: type });
    await addOcrPage(out, ctx, 1, { bytes: file.bytes, mime: type });
    return out;
  }
  if (type === HTML) {
    // shortcut: tag stripping, not a DOM parse; use DOMParser in the extension when HTML documents matter.
    const s = new TextDecoder().decode(file.bytes).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
    out.pageCount = 1;
    const p = buildPage(docId, version, 1, s.split('\n').map((t) => ({ text: t.trim() })), 'html-text');
    if (p.passages.length) out.pages.push(p);
    else out.gaps.push(gap(docId, version, 1, 'unreadable_page', 'html without text'));
    return out;
  }
  if (type !== PDF) return docGap('unsupported_media', type || 'unknown type');

  let pdf;
  const task = getDocument({ data: new Uint8Array(file.bytes), verbosity: 0, isEvalSupported: false, stopAtErrors: true });
  try {
    pdf = await task.promise;
  } catch (e) {
    await task.destroy();
    return docGap('corrupt_file', e?.name ?? 'parse error');
  }
  try {
    out.pageCount = pdf.numPages;
    for (let n = 1; n <= pdf.numPages; n++) {
      let pdfPage;
      try {
        pdfPage = await pdf.getPage(n);
        const p = buildPage(docId, version, n, await pdfTextLines(pdfPage), 'pdf-text');
        if (p.passages.length) {
          out.pages.push(p);
          continue;
        }
      } catch (e) {
        out.gaps.push(gap(docId, version, n, 'page_failed', e?.name ?? 'error'));
        continue;
      }
      // No text layer: a scanned page. OCR it when an engine and a renderer exist.
      if (!ctx.ocr || !ctx.renderPage) {
        out.gaps.push(gap(docId, version, n, 'unreadable_page', 'no text layer; OCR not available'));
        continue;
      }
      let image;
      try {
        image = await ctx.renderPage(pdfPage, n);
      } catch (e) {
        out.gaps.push(gap(docId, version, n, 'page_failed', `render: ${e?.name ?? 'error'}`));
        continue;
      }
      out.images.push({ page: n, ...image });
      await addOcrPage(out, ctx, n, image);
    }
  } finally {
    await task.destroy();
  }
  return out;
}

async function addOcrPage(out, ctx, n, image) {
  try {
    const p = await ocrPage(ctx, out.docId, out.version, n, image);
    if (p.passages.length) out.pages.push(p);
    else out.gaps.push(gap(out.docId, out.version, n, 'unreadable_page', 'OCR found no text'));
  } catch (e) {
    out.gaps.push(gap(out.docId, out.version, n, 'ocr_failed', e?.name ?? 'error'));
  }
}

// Extracts every inventory item (#4 shape). fetchFile(item) -> { bytes, contentType }.
// Items the inventory did not process become gaps; a throw on one item stays on that item.
export async function extractCase(inventory, fetchFile, ctx = {}) {
  const results = [];
  for (const item of inventory.items) {
    const base = { docId: item.id, version: item.version, kind: item.kind ?? 'document', href: item.href ?? null, expectedPages: item.expectedPages ?? null, pageCount: 0, pages: [], images: [] };
    if (item.state !== 'processed') {
      results.push({ ...base, gaps: [gap(item.id, item.version, null, INVENTORY_GAP[item.state] ?? 'fetch_failed', item.detail ?? item.state)] });
      continue;
    }
    let file;
    try {
      file = await fetchFile(item);
    } catch (e) {
      results.push({ ...base, gaps: [gap(item.id, item.version, null, 'fetch_failed', e?.name ?? 'error')] });
      continue;
    }
    try {
      results.push(await extractDocument(item, file, ctx));
    } catch (e) {
      results.push({ ...base, gaps: [gap(item.id, item.version, null, 'extraction_error', e?.name ?? 'error')] });
    }
  }
  return results;
}

// A passage can support a decisive fact only when its recognition is trusted.
export function canSupportDecisive(passage) {
  if (passage.lowConfidence) return { ok: false, reason: 'low_confidence' };
  if (passage.method.startsWith('ocr:') && passage.confidence == null) return { ok: false, reason: 'no_confidence' };
  return { ok: true, reason: null };
}

// Splits passages into the ones a model call may receive and gap records for the rest.
// exclude(passage) returns a reason string to keep a passage out, or a falsy value.
export function forTransmission(passages, exclude = () => null) {
  const send = [];
  const gaps = [];
  for (const p of passages) {
    const why = exclude(p);
    if (why) gaps.push({ ...gap(p.docId, p.version, p.page, 'excluded_from_transmission', why), passageId: p.id });
    else send.push(p);
  }
  return { send, gaps };
}

export const passagesOf = (results) => results.flatMap((r) => r.pages.flatMap((p) => p.passages));

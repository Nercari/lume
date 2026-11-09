// Tolerant reader for a PJe+R "extrair autos em texto" export.
// The public format is not documented. Each rule below is named and optional:
// a file may use any subset. When a Documento: header is present it wins, and
// every header becomes a document. Otherwise the older rules apply. When none
// of them fire, the text is one document "sem-id" cut into blocks of about
// 3000 characters.
import { classifyPiece } from './classify.js';
import { fold, numPagMatches } from './rules.js';
import { cleanVersion, passageIdFor } from './segment.js';

export const TEXT_BLOCK_CHARS = 3000;

export const TEXT_RULES = Object.freeze({
  formFeed: Object.freeze({ id: 'form_feed' }),
  footerNumPag: Object.freeze({ id: 'footer_num_pag' }),
  numeroDocumento: Object.freeze({ id: 'numero_documento' }),
  headingId: Object.freeze({ id: 'heading_id' }),
  titleThenType: Object.freeze({ id: 'title_then_type' }),
  fallbackSemId: Object.freeze({ id: 'fallback_sem_id', docId: 'sem-id', chars: TEXT_BLOCK_CHARS }),
  placeholder: Object.freeze({ id: 'imagem_sem_texto', detail: 'imagem/sem texto' }),
  documentoHeader: Object.freeze({ id: 'documento_header' }),
  processoHeader: Object.freeze({ id: 'processo_header' }),
  juntadaLine: Object.freeze({ id: 'juntada_line' }),
  separatorDashes: Object.freeze({ id: 'separator_dashes' }),
  paginaMarker: Object.freeze({ id: 'pagina_marker' }),
  nulStrip: Object.freeze({ id: 'nul_strip' }),
  utf16le: Object.freeze({ id: 'utf16le' }),
  crlf: Object.freeze({ id: 'crlf' }),
  // detail is the lacuna label. The pack lists unreadable_page, so the gap uses that reason.
  binaryUnreadable: Object.freeze({ id: 'binary_unreadable', detail: 'binário/ilegível', reason: 'unreadable_page' }),
});

// A page of prose stays under both lines. PDF streams trip one of them.
export const BINARY_THRESHOLDS = Object.freeze({
  minChars: 48,
  controlRatio: 0.02,
  nonLetterRatio: 0.85,
});

// A line inside a readable piece. Mostly-letter lines are kept and then stripped.
export const LINE_BINARY_THRESHOLDS = Object.freeze({
  minChars: 24,
  controlRatio: 0.15,
  nonLetterRatio: 0.9,
  keepLetterRatio: 0.5,
});

const OMITTED_BINARY_LINE = Object.freeze({
  reason: 'binary_span_omitted',
  detail: 'trecho binário omitido',
});

const PLACEHOLDER_LINE = [
  /^\[?\s*imagem\s*\]?$/u,
  /^\[?\s*image\s*\]?$/u,
  /^documento\s+digitalizado\.?$/u,
  /^imagem\s+digitalizada\.?$/u,
  /^\[?\s*digitalizado\s*\]?$/u,
  /^sem\s+texto\.?$/u,
];

// Bare "petição" is a type word in these exports. classifyPiece only matches
// "petição inicial", so this one spelling is accepted as that piece.
const BARE_PETITION = 'peticao';

export function matchHeadingId(line) {
  const folded = fold(line).trim();
  const document = /^id\s+do\s+documento\s*[:\-]?\s*(\d{1,40})$/u.exec(folded);
  if (document) return document[1];
  const colon = /^id\s*:\s*(\d{1,12})$/u.exec(folded);
  if (colon) return colon[1];
  const bare = /^id\s+(\d{1,12})$/u.exec(folded);
  if (bare) return bare[1];
  return null;
}

export function matchNumeroDocumento(line) {
  const match = /^numero\s+do\s+documento\s*[:\-]?\s*(\d{1,40})$/u.exec(fold(line).trim());
  return match ? match[1] : null;
}

function isTitleLine(line) {
  const trimmed = String(line ?? '').trim();
  if (!trimmed || trimmed.length > 80) return false;
  if (/[.!?]$/u.test(trimmed)) return false;
  if (trimmed.split(/\s+/).length > 8) return false;
  return true;
}

export function typeWordOf(line) {
  const trimmed = String(line ?? '').trim().replace(/[.:]+$/u, '');
  if (!trimmed || trimmed.length > 60) return null;
  if (trimmed.split(/\s+/).length > 4) return null;
  const piece = classifyPiece(trimmed);
  if (piece !== 'outros') return piece;
  if (fold(trimmed) === BARE_PETITION) return 'petição inicial';
  return null;
}

export function isPlaceholderBody(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return true;
  const folded = fold(trimmed);
  if (PLACEHOLDER_LINE.some((pattern) => pattern.test(folded))) return true;
  const alnum = folded.replace(/[^a-z0-9]/g, '');
  return alnum.length <= 3;
}

function nextNonEmpty(lines, start) {
  for (let index = start; index < lines.length; index += 1) {
    if (lines[index].trim()) return lines[index].trim();
  }
  return null;
}

function splitFooterPages(chunk) {
  const lines = chunk.split('\n');
  const groups = [];
  let buffer = [];
  for (const line of lines) {
    buffer.push(line);
    if (numPagMatches(line).length) {
      groups.push(buffer.join('\n'));
      buffer = [];
    }
  }
  if (buffer.some((line) => line.trim()) || !groups.length) groups.push(buffer.join('\n'));
  return groups;
}

function splitPages(text) {
  const chunks = text.split('\f');
  const formFeed = text.includes('\f');
  const pages = [];
  for (const chunk of chunks) {
    for (const raw of splitFooterPages(chunk)) pages.push({ raw, formFeed });
  }
  return pages;
}

// A heading, a document number, or a title/type pair after the body has started
// opens another piece. A type line only does that after a blank line, so a
// sentence that happens to contain "decisão" stays in the piece.
function splitSlices(pageText) {
  const lines = pageText.split('\n');
  const slices = [];
  let current = [];
  let bodyLines = 0;
  let sawHeading = false;
  let headingClosed = false;
  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      if (sawHeading) headingClosed = true;
      current.push(lines[index]);
      index += 1;
      continue;
    }
    const heading = matchHeadingId(trimmed);
    const numero = matchNumeroDocumento(trimmed);
    const type = typeWordOf(trimmed);
    const next = nextNonEmpty(lines, index + 1);
    const titlePair = !type && next && typeWordOf(next) && isTitleLine(trimmed);
    const blankBefore = index === 0 || !lines[index - 1].trim();
    const pieceStart = heading || numero || ((type || titlePair) && blankBefore);
    const alreadyStarted = bodyLines > 0 || headingClosed;
    if (pieceStart && alreadyStarted && current.some((line) => line.trim())) {
      slices.push({ raw: current.join('\n'), boundary: slices.length > 0 });
      current = [];
      bodyLines = 0;
      sawHeading = false;
      headingClosed = false;
      continue;
    }
    current.push(lines[index]);
    if (type || titlePair) sawHeading = true;
    const structuralLine = heading || numero || type || titlePair || numPagMatches(trimmed).length;
    if (!structuralLine) bodyLines += 1;
    index += 1;
  }
  if (current.some((line) => line.trim())) slices.push({ raw: current.join('\n'), boundary: slices.length > 0 });
  return slices;
}

function parseSlice(raw, formFeed) {
  const lines = raw.split('\n');
  const rules = new Set();
  if (formFeed) rules.add(TEXT_RULES.formFeed.id);
  let headingId = null;
  let numero = null;
  let title = null;
  let piece = null;
  let titleRule = false;
  let headingOpen = true;
  let sawHeading = false;
  const body = [];

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed) {
      if (sawHeading) headingOpen = false;
      if (!headingOpen) body.push('');
      continue;
    }
    const footerHit = numPagMatches(trimmed).length > 0;
    if (headingOpen) {
      const heading = matchHeadingId(trimmed);
      if (heading) {
        headingId = heading;
        rules.add(TEXT_RULES.headingId.id);
        continue;
      }
      const documentNumber = matchNumeroDocumento(trimmed);
      if (documentNumber) {
        numero = documentNumber;
        rules.add(TEXT_RULES.numeroDocumento.id);
        continue;
      }
      if (footerHit) continue;
      const type = typeWordOf(trimmed);
      const next = nextNonEmpty(lines, index + 1);
      const nextType = next ? typeWordOf(next) : null;
      if (type) {
        piece = type;
        titleRule = true;
        sawHeading = true;
        rules.add(TEXT_RULES.titleThenType.id);
        if (!title) title = trimmed;
        continue;
      }
      if (nextType && isTitleLine(trimmed)) {
        if (!title) title = trimmed;
        piece = nextType;
        titleRule = true;
        sawHeading = true;
        rules.add(TEXT_RULES.titleThenType.id);
        continue;
      }
      headingOpen = false;
    }
    if (footerHit && !nextNonEmpty(lines, index + 1)) continue;
    body.push(trimmed);
  }

  const footer = numPagMatches(raw).at(-1) ?? null;
  if (footer?.docId) rules.add(TEXT_RULES.footerNumPag.id);
  const docId = footer?.docId || headingId || numero || null;
  return {
    docId,
    title,
    piece,
    titleRule,
    body: body.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    footer,
    formFeed,
    rules,
  };
}

function leavesFrom(text) {
  const pages = splitPages(text);
  const leaves = [];
  for (const page of pages) {
    const slices = splitSlices(page.raw);
    slices.forEach((slice, index) => {
      const parsed = parseSlice(slice.raw, page.formFeed);
      if (!parsed.body && !parsed.docId && !parsed.titleRule && !parsed.footer) return;
      leaves.push({ ...parsed, boundary: slice.boundary });
    });
  }
  return leaves;
}

function sameDocument(current, leaf) {
  if (!current) return false;
  if (leaf.docId && current.docId && leaf.docId === current.docId) return true;
  if (leaf.docId && current.docId && leaf.docId !== current.docId) return false;
  if (leaf.boundary || leaf.titleRule) return false;
  if (leaf.docId && !current.docId) return false;
  return true;
}

function groupLeaves(leaves) {
  const docs = [];
  for (const leaf of leaves) {
    const current = docs.at(-1);
    if (!sameDocument(current, leaf)) {
      docs.push({
        docId: leaf.docId,
        title: leaf.title,
        piece: leaf.piece,
        titleRule: leaf.titleRule,
        rules: new Set(leaf.rules),
        formFeed: leaf.formFeed,
        leaves: [leaf],
      });
      continue;
    }
    if (!current.title && leaf.title) current.title = leaf.title;
    if ((!current.piece || current.piece === 'outros') && leaf.piece) current.piece = leaf.piece;
    if (leaf.titleRule) current.titleRule = true;
    for (const rule of leaf.rules) current.rules.add(rule);
    current.leaves.push(leaf);
  }
  return docs;
}

function assignSheetNumbers(doc) {
  for (const leaf of doc.leaves) {
    leaf.pageInDoc = leaf.footer?.pageInDoc != null ? leaf.footer.pageInDoc : null;
  }
}

function textPassageId(docId, version, pageInDoc, ordinal) {
  if (pageInDoc != null) return passageIdFor(docId, version, pageInDoc, null);
  return `${docId}@${version}:t${ordinal}`;
}

function assignMissingIds(docs) {
  let titleCount = 0;
  for (const doc of docs) {
    if (doc.docId) continue;
    if (doc.titleRule) {
      titleCount += 1;
      doc.docId = `titulo-${titleCount}`;
      continue;
    }
    doc.docId = TEXT_RULES.fallbackSemId.docId;
  }
}

function splitBlocks(text, size) {
  const blocks = [];
  let rest = text.trim();
  while (rest.length > size) {
    let cut = rest.lastIndexOf('\n', size);
    if (cut < Math.floor(size * 0.5)) cut = rest.lastIndexOf(' ', size);
    if (cut < Math.floor(size * 0.5)) cut = size;
    const block = rest.slice(0, cut).trim();
    if (block) blocks.push(block);
    rest = rest.slice(cut).trim();
  }
  if (rest) blocks.push(rest);
  return blocks;
}

function structural(leaves) {
  return leaves.some((leaf) => leaf.docId || leaf.titleRule || leaf.formFeed || leaf.footer);
}

function signalsOf(doc) {
  const signals = [];
  if (doc.rules.has(TEXT_RULES.footerNumPag.id)) signals.push('footer');
  if (doc.titleRule || doc.rules.has(TEXT_RULES.headingId.id) || doc.rules.has(TEXT_RULES.titleThenType.id)) {
    signals.push('heading');
  }
  return signals;
}

function materialize(docs, version) {
  const pages = [];
  const passages = [];
  const gaps = [];
  const documents = [];
  let ordinal = 0;
  for (const doc of docs) {
    assignSheetNumbers(doc);
    const numbers = [];
    for (const leaf of doc.leaves) {
      ordinal += 1;
      numbers.push(ordinal);
      const body = classifyBody(leaf.body);
      const placeholder = body.kind !== 'text';
      const text = body.text;
      const passageId = textPassageId(doc.docId, version, leaf.pageInDoc, ordinal);
      const page = {
        n: ordinal,
        hasText: !placeholder,
        chars: text.replace(/\s/g, '').length,
        footer: leaf.footer ? { docId: leaf.footer.docId, pageInDoc: leaf.footer.pageInDoc, docNumber: null } : null,
        docId: doc.docId,
        pageInDoc: leaf.pageInDoc,
        passageId,
        method: placeholder ? null : 'text',
        text,
      };
      pages.push(page);
      passages.push({
        id: passageId,
        docId: doc.docId,
        version,
        pageInDoc: leaf.pageInDoc,
        pdfPage: null,
        text,
        method: page.method,
        hasText: page.hasText,
      });
      if (body.kind === 'binary') {
        gaps.push({
          reason: TEXT_RULES.binaryUnreadable.reason,
          page: ordinal,
          docId: doc.docId,
          pageInDoc: leaf.pageInDoc,
          passageId,
          detail: TEXT_RULES.binaryUnreadable.detail,
        });
      } else if (placeholder) {
        gaps.push({
          reason: 'image_no_text',
          page: ordinal,
          docId: doc.docId,
          pageInDoc: leaf.pageInDoc,
          passageId,
          detail: TEXT_RULES.placeholder.detail,
        });
      } else if (body.dropped) {
        gaps.push({
          reason: OMITTED_BINARY_LINE.reason,
          page: ordinal,
          docId: doc.docId,
          pageInDoc: leaf.pageInDoc,
          passageId,
          detail: OMITTED_BINARY_LINE.detail,
          count: body.dropped,
        });
      }
    }
    const piece = doc.piece || 'outros';
    documents.push({
      docId: doc.docId,
      title: doc.title,
      type: doc.title,
      piece,
      typeSource: doc.titleRule ? 'heading' : 'none',
      headingWeak: false,
      startPage: numbers[0],
      endPage: numbers[numbers.length - 1],
      pages: numbers,
      signals: signalsOf(doc),
      rules: [...doc.rules],
      version,
    });
  }
  const rules = [...new Set(docs.flatMap((doc) => [...doc.rules]))];
  return {
    version,
    origin: 'text',
    pageCount: pages.length,
    pages,
    documents,
    passages,
    gaps,
    rules,
  };
}

function fallbackResult(text, version) {
  const body = text.trim();
  if (!body || isPlaceholderBody(body)) {
    return {
      version,
      origin: 'text',
      pageCount: 0,
      pages: [],
      documents: [],
      passages: [],
      gaps: [{
        reason: body ? 'image_no_text' : 'empty_text',
        page: null,
        docId: TEXT_RULES.fallbackSemId.docId,
        detail: body ? TEXT_RULES.placeholder.detail : 'texto vazio',
      }],
      rules: [TEXT_RULES.fallbackSemId.id],
    };
  }
  const blocks = splitBlocks(body, TEXT_BLOCK_CHARS);
  const doc = {
    docId: TEXT_RULES.fallbackSemId.docId,
    title: null,
    piece: 'outros',
    titleRule: false,
    rules: new Set([TEXT_RULES.fallbackSemId.id]),
    leaves: blocks.map((block) => ({ body: block, footer: null, rules: new Set() })),
  };
  return materialize([doc], version);
}

const PROCESSO_LINE = /^Processo:\s*(\d{1,7}-\d{2}\.\d{4}\.\d\.\d{2}\.\d{4})\s*$/u;
const PAGINA_LINE = /^\s*[Pp][áa]gina\s+(\d{1,6})\s+de\s+(\d{1,6})\b\s*(.*)$/u;
const DASH_LINE = /^-{20,}\s*$/u;

function isLetterCode(code) {
  if (code >= 65 && code <= 90) return true;
  if (code >= 97 && code <= 122) return true;
  return code >= 192 && code <= 687;
}

export function binaryScores(text) {
  const raw = String(text ?? '');
  let control = 0;
  let letters = 0;
  let nonSpace = 0;
  for (const ch of raw) {
    const code = ch.codePointAt(0);
    if (code === 9 || code === 10 || code === 13 || code === 32) continue;
    nonSpace += 1;
    if (code < 32 || code === 127) control += 1;
    else if (isLetterCode(code)) letters += 1;
  }
  return {
    length: raw.length,
    control,
    letters,
    nonSpace,
    controlRatio: raw.length ? control / raw.length : 0,
    nonLetterRatio: nonSpace ? 1 - (letters / nonSpace) : 0,
  };
}

export function isBinaryBody(text) {
  const scores = binaryScores(text);
  if (scores.length < BINARY_THRESHOLDS.minChars) return false;
  if (scores.controlRatio >= BINARY_THRESHOLDS.controlRatio) return true;
  return scores.nonSpace >= BINARY_THRESHOLDS.minChars
    && scores.nonLetterRatio >= BINARY_THRESHOLDS.nonLetterRatio;
}

// C0 controls except tab and newline. Form feed is a page break before this runs.
export function stripC0(text) {
  return String(text ?? '').replace(/[\u0000-\u0008\u000B-\u001F]/g, '');
}

export function isBinaryLine(text) {
  const scores = binaryScores(text);
  if (scores.length < LINE_BINARY_THRESHOLDS.minChars) return false;
  if (scores.controlRatio >= LINE_BINARY_THRESHOLDS.controlRatio) return true;
  const letterRatio = scores.nonSpace ? scores.letters / scores.nonSpace : 0;
  if (letterRatio >= LINE_BINARY_THRESHOLDS.keepLetterRatio) return false;
  return scores.nonSpace >= LINE_BINARY_THRESHOLDS.minChars
    && scores.nonLetterRatio >= LINE_BINARY_THRESHOLDS.nonLetterRatio;
}

function cleanPieceText(text) {
  const kept = [];
  let dropped = 0;
  for (const line of String(text ?? '').split('\n')) {
    if (!line.trim()) {
      kept.push('');
      continue;
    }
    if (isBinaryLine(line)) {
      dropped += 1;
      continue;
    }
    const cleaned = stripC0(line);
    if (!cleaned.trim()) {
      dropped += 1;
      continue;
    }
    kept.push(cleaned);
  }
  return { text: kept.join('\n').replace(/\n{3,}/g, '\n\n').trim(), dropped };
}

function isBytes(input) {
  return Buffer.isBuffer(input) || input instanceof Uint8Array;
}

function utf16LePairs(length, readPair) {
  if (length < 8) return false;
  const pairs = Math.floor(length / 2);
  let highNul = 0;
  let lowNul = 0;
  for (let index = 0; index < pairs; index += 1) {
    const pair = readPair(index);
    if (!pair) return false;
    if (pair.low === 0) lowNul += 1;
    if (pair.high === 0) highNul += 1;
    const remaining = pairs - (index + 1);
    if (highNul + remaining < pairs * 0.8) return false;
  }
  return highNul / pairs >= 0.8 && lowNul / pairs <= 0.2;
}

function isUtf16LeBytes(bytes) {
  return utf16LePairs(bytes.length, (index) => ({
    low: bytes[index * 2],
    high: bytes[index * 2 + 1],
  }));
}

function isUtf16LeBinaryString(value) {
  return utf16LePairs(value.length, (index) => {
    const low = value.charCodeAt(index * 2);
    const high = value.charCodeAt(index * 2 + 1);
    if (low > 255 || high > 255) return null;
    return { low, high };
  });
}

function binaryStringToUtf16Le(value) {
  const bytes = Buffer.allocUnsafe(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes.toString('utf16le');
}

export function decodeExport(input) {
  const rules = new Set();
  let text;
  if (isBytes(input)) {
    const bytes = Buffer.from(input);
    if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
      rules.add(TEXT_RULES.utf16le.id);
      text = bytes.subarray(2).toString('utf16le');
    } else if (isUtf16LeBytes(bytes)) {
      rules.add(TEXT_RULES.utf16le.id);
      text = bytes.toString('utf16le');
    } else {
      text = bytes.toString('utf8');
    }
  } else {
    const raw = String(input ?? '');
    if (raw.length >= 2 && raw.charCodeAt(0) === 0xff && raw.charCodeAt(1) === 0xfe) {
      rules.add(TEXT_RULES.utf16le.id);
      text = binaryStringToUtf16Le(raw.slice(2));
    } else if (isUtf16LeBinaryString(raw)) {
      rules.add(TEXT_RULES.utf16le.id);
      text = binaryStringToUtf16Le(raw);
    } else {
      text = raw;
    }
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  if (text.includes('\u0000')) {
    rules.add(TEXT_RULES.nulStrip.id);
    text = text.replaceAll('\u0000', '');
  }
  if (text.includes('\r')) {
    rules.add(TEXT_RULES.crlf.id);
    text = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  }
  return { text, rules };
}

export function matchDocumentoHeader(line) {
  const match = /^Documento:\s*(\d{9})\s*-\s*(.*)$/u.exec(String(line ?? '').trim());
  if (!match) return null;
  return { docId: match[1], rest: match[2].trim() };
}

export function countDocumentoHeaders(text) {
  let count = 0;
  for (const line of String(text ?? '').split('\n')) {
    if (matchDocumentoHeader(line)) count += 1;
  }
  return count;
}

function recognizedPiece(field) {
  const byWord = typeWordOf(field);
  if (byWord) return byWord;
  const byClass = classifyPiece(field);
  return byClass !== 'outros' ? byClass : null;
}

export function classifyDocumentoFields(fields) {
  const list = (fields ?? []).map((field) => String(field ?? '').trim()).filter(Boolean);
  let typeField = null;
  let piece = 'outros';
  for (const field of list) {
    if (/^\d+$/u.test(field)) continue;
    const recognized = recognizedPiece(field);
    if (recognized) {
      typeField = field;
      piece = recognized;
      break;
    }
  }
  if (!typeField) typeField = list.find((field) => !/^\d+$/u.test(field)) ?? null;
  const party = list.length ? list[list.length - 1] : null;
  return { typeField, piece, party };
}

function isJuntadaLine(line) {
  if (line.length < 80) return false;
  const folded = fold(line);
  const hasId = /id\s+do\s+documento\s*:/u.test(folded);
  const hasJoin = /juntado\s+aos\s+autos/u.test(folded);
  const hasUrl = folded.includes('consultadocumento');
  const hasSign = /documento\s+assinado\s+por/u.test(folded);
  return (hasJoin && (hasId || hasUrl || hasSign)) || (hasId && hasUrl);
}

function juntadaMeta(line, headerId) {
  const idMatch = /id\s+do\s+documento\s*:\s*(\d{9})/iu.exec(line);
  const dateMatch = /\bem\s+(\d{2}\/\d{2}\/\d{4}(?:\s+\d{2}:\d{2}:\d{2})?)/iu.exec(line);
  const signed = /documento\s+assinado\s+por\s*:\s*-?\s*(.+?)(?=\s+consulte\b|\s+id\s+do\s+documento\b|$)/iu.exec(line);
  const bodyId = idMatch ? idMatch[1] : null;
  return {
    juntadaAt: dateMatch ? dateMatch[1] : null,
    signedBy: signed ? signed[1].replace(/\s+/g, ' ').trim() : null,
    mismatch: Boolean(bodyId && bodyId !== headerId),
  };
}

function classifyBody(text) {
  const trimmed = String(text ?? '').trim();
  if (!trimmed) return { kind: 'image', text: '', dropped: 0 };
  const cleaned = cleanPieceText(trimmed);
  if (!cleaned.text) {
    return isBinaryBody(trimmed) || cleaned.dropped
      ? { kind: 'binary', text: '', dropped: cleaned.dropped }
      : { kind: 'image', text: '', dropped: 0 };
  }
  if (isPlaceholderBody(cleaned.text)) return { kind: 'image', text: '', dropped: cleaned.dropped };
  return { kind: 'text', text: cleaned.text, dropped: cleaned.dropped };
}

function sheetsOf(piece, fileRules) {
  const marked = [];
  let current = null;
  const loose = [];
  let sawMarker = false;
  for (const line of piece.bodyLines) {
    const marker = PAGINA_LINE.exec(line);
    if (marker) {
      sawMarker = true;
      piece.rules.add(TEXT_RULES.paginaMarker.id);
      fileRules.add(TEXT_RULES.paginaMarker.id);
      if (current) marked.push(current);
      const rest = marker[3].trim();
      current = { pageInDoc: Number(marker[1]), lines: rest ? [rest] : [] };
      continue;
    }
    if (current) current.lines.push(line);
    else loose.push(line);
  }
  if (current) marked.push(current);
  if (!sawMarker) return [{ pageInDoc: null, text: loose.join('\n').trim() }];
  if (marked.length && loose.some((line) => line.trim())) {
    marked[0].lines = [...loose, ...marked[0].lines];
  }
  return marked.map((page) => ({
    pageInDoc: page.pageInDoc,
    text: page.lines.join('\n').trim(),
  }));
}

function materializePje(pieces, version, processNumber, fileRules) {
  const pages = [];
  const passages = [];
  const gaps = [];
  const documents = [];
  let ordinal = 0;
  for (const piece of pieces) {
    const sheets = sheetsOf(piece, fileRules);
    const numbers = [];
    let omittedLines = 0;
    let omittedAt = null;
    for (const sheet of sheets) {
      ordinal += 1;
      numbers.push(ordinal);
      const body = classifyBody(sheet.text);
      const hasText = body.kind === 'text';
      const text = hasText ? body.text : '';
      const passageId = textPassageId(piece.docId, version, sheet.pageInDoc, ordinal);
      if (body.kind === 'binary') {
        piece.rules.add(TEXT_RULES.binaryUnreadable.id);
        fileRules.add(TEXT_RULES.binaryUnreadable.id);
      } else if (body.dropped) {
        omittedLines += body.dropped;
        if (!omittedAt) omittedAt = { page: ordinal, pageInDoc: sheet.pageInDoc, passageId };
      }
      const page = {
        n: ordinal,
        hasText,
        chars: text.replace(/\s/g, '').length,
        footer: null,
        docId: piece.docId,
        pageInDoc: sheet.pageInDoc,
        passageId,
        method: hasText ? 'text' : null,
        text,
      };
      pages.push(page);
      passages.push({
        id: passageId,
        docId: piece.docId,
        version,
        pageInDoc: sheet.pageInDoc,
        pdfPage: null,
        text,
        method: page.method,
        hasText,
      });
      if (body.kind === 'image') {
        gaps.push({
          reason: 'image_no_text',
          page: ordinal,
          docId: piece.docId,
          pageInDoc: sheet.pageInDoc,
          passageId,
          detail: TEXT_RULES.placeholder.detail,
        });
      } else if (body.kind === 'binary') {
        gaps.push({
          reason: TEXT_RULES.binaryUnreadable.reason,
          page: ordinal,
          docId: piece.docId,
          pageInDoc: sheet.pageInDoc,
          passageId,
          detail: TEXT_RULES.binaryUnreadable.detail,
        });
      }
    }
    if (omittedLines > 0) {
      gaps.push({
        reason: OMITTED_BINARY_LINE.reason,
        page: omittedAt.page,
        docId: piece.docId,
        pageInDoc: omittedAt.pageInDoc,
        passageId: omittedAt.passageId,
        detail: OMITTED_BINARY_LINE.detail,
        count: omittedLines,
      });
    }
    if (piece.mismatch) {
      gaps.push({
        reason: 'id_mismatch',
        page: numbers[0] ?? null,
        docId: piece.docId,
        pageInDoc: sheets[0]?.pageInDoc ?? null,
        detail: 'ID do documento diverge do cabeçalho',
      });
    }
    documents.push({
      docId: piece.docId,
      title: piece.typeField,
      type: piece.typeField,
      piece: piece.piece || 'outros',
      party: piece.party,
      juntadaAt: piece.juntadaAt,
      signedBy: piece.signedBy,
      typeSource: piece.typeField ? 'heading' : 'none',
      headingWeak: false,
      startPage: numbers[0] ?? null,
      endPage: numbers.at(-1) ?? null,
      pages: numbers,
      signals: ['heading'],
      rules: [...piece.rules],
      version,
    });
  }
  return {
    version,
    origin: 'text',
    processNumber,
    pageCount: pages.length,
    pages,
    documents,
    passages,
    gaps,
    rules: [...fileRules],
  };
}

function segmentPjeExport(source, version, decodeRules) {
  const lines = source.split('\n');
  const fileRules = new Set(decodeRules);
  fileRules.add(TEXT_RULES.documentoHeader.id);
  let processNumber = null;
  let start = 0;
  while (start < lines.length && !lines[start].trim()) start += 1;
  if (start < lines.length) {
    const processo = PROCESSO_LINE.exec(lines[start].trim());
    if (processo) {
      processNumber = processo[1];
      fileRules.add(TEXT_RULES.processoHeader.id);
      start += 1;
    }
  }

  const pieces = [];
  let current = null;
  for (let index = start; index < lines.length; index += 1) {
    const header = matchDocumentoHeader(lines[index]);
    if (header) {
      if (current) pieces.push(current);
      const fields = header.rest.split(/\s+-\s+/).map((part) => part.trim()).filter(Boolean);
      const classified = classifyDocumentoFields(fields);
      current = {
        docId: header.docId,
        typeField: classified.typeField,
        piece: classified.piece,
        party: classified.party,
        rules: new Set([TEXT_RULES.documentoHeader.id]),
        bodyLines: [],
        juntadaAt: null,
        signedBy: null,
        mismatch: false,
      };
      continue;
    }
    if (!current) continue;
    const line = lines[index];
    if (DASH_LINE.test(line.trim())) {
      current.rules.add(TEXT_RULES.separatorDashes.id);
      fileRules.add(TEXT_RULES.separatorDashes.id);
      continue;
    }
    if (isJuntadaLine(line)) {
      const meta = juntadaMeta(line, current.docId);
      current.rules.add(TEXT_RULES.juntadaLine.id);
      fileRules.add(TEXT_RULES.juntadaLine.id);
      if (!current.juntadaAt && meta.juntadaAt) current.juntadaAt = meta.juntadaAt;
      if (!current.signedBy && meta.signedBy) current.signedBy = meta.signedBy;
      if (meta.mismatch) current.mismatch = true;
      continue;
    }
    current.bodyLines.push(line);
  }
  if (current) pieces.push(current);
  return materializePje(pieces, version, processNumber, fileRules);
}

function withDecodeRules(result, rules) {
  if (!rules || rules.size === 0) return result;
  return { ...result, rules: [...new Set([...rules, ...result.rules])] };
}

export function segmentText(text, options = {}) {
  const version = cleanVersion(options.version);
  const decoded = decodeExport(text);
  const source = decoded.text;
  if (!source.trim()) return withDecodeRules(fallbackResult('', version), decoded.rules);
  if (countDocumentoHeaders(source) > 0) return segmentPjeExport(source, version, decoded.rules);
  const leaves = leavesFrom(source);
  if (!structural(leaves)) return withDecodeRules(fallbackResult(source, version), decoded.rules);
  const docs = groupLeaves(leaves);
  assignMissingIds(docs);
  return withDecodeRules(materialize(docs, version), decoded.rules);
}

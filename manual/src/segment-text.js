// Tolerant reader for a PJe+R "extrair autos em texto" export.
// The public format is not documented. Each rule below is named and optional:
// a file may use any subset. When none of them fire, the text is one document
// "sem-id" cut into blocks of about 3000 characters.
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
  let next = 1;
  for (const leaf of doc.leaves) {
    if (leaf.footer?.pageInDoc != null) {
      leaf.pageInDoc = leaf.footer.pageInDoc;
      next = leaf.footer.pageInDoc + 1;
    } else {
      leaf.pageInDoc = next;
      next += 1;
    }
  }
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
      const placeholder = isPlaceholderBody(leaf.body);
      const text = placeholder ? '' : leaf.body;
      const passageId = passageIdFor(doc.docId, version, leaf.pageInDoc, ordinal);
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
        pdfPage: ordinal,
        text,
        method: page.method,
        hasText: page.hasText,
      });
      if (placeholder) {
        gaps.push({
          reason: 'image_no_text',
          page: ordinal,
          docId: doc.docId,
          pageInDoc: leaf.pageInDoc,
          passageId,
          detail: TEXT_RULES.placeholder.detail,
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

export function segmentText(text, options = {}) {
  const version = cleanVersion(options.version);
  const source = String(text ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!source.trim()) return fallbackResult('', version);
  const leaves = leavesFrom(source);
  if (!structural(leaves)) return fallbackResult(source, version);
  const docs = groupLeaves(leaves);
  assignMissingIds(docs);
  return materialize(docs, version);
}

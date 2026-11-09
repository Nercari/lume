// Multi-part case pack for ChatGPT when one part would exceed ~100k tokens (~350k chars pt-BR).
import { OCR_MARK } from './ocr-text.js';
import {
  packNoticeLines,
  passageTag,
  renderPackGaps,
  renderPackIndex,
} from './pack.js';
import { formatSpan, pagesByDoc, sheetNumber } from './sheets.js';

export const DEFAULT_PACK_PART_MAX_CHARS = 350_000;

const TEXT_GAPS = new Set(['unreadable_page', 'image_no_text', 'corrupt_file', 'empty_text']);

function padPartNumber(n, total) {
  const width = String(total).length;
  return String(n).padStart(Math.max(2, width), '0');
}

export function partFileName(partIndex, totalParts) {
  return `lume-caso-parte-${padPartNumber(partIndex, totalParts)}-de-${padPartNumber(totalParts, totalParts)}.md`;
}

function collectPassageBlocks(caseResult) {
  const groups = pagesByDoc(caseResult);
  const docs = caseResult?.documents?.length
    ? caseResult.documents
    : [...groups.keys()].map((docId) => ({ docId }));
  const blocks = [];
  for (const doc of docs) {
    const pages = groups.get(String(doc.docId)) ?? [];
    pages.forEach((page, index) => {
      const text = String(page.text ?? '').trim();
      if (!page.hasText || !text) return;
      const sheet = sheetNumber(page, index + 1);
      const tag = passageTag(page.docId, sheet);
      const lines = [tag, text];
      if (page.method === 'ocr') lines.push(OCR_MARK);
      blocks.push({ docId: String(page.docId), text: lines.join('\n') });
    });
  }
  if (!blocks.length) {
    blocks.push({ docId: '—', text: 'Nenhum trecho com texto.' });
  }
  return blocks;
}

function splitTagLine(blockText) {
  const firstNewline = blockText.indexOf('\n');
  if (firstNewline === -1) return { tag: blockText, body: '' };
  return { tag: blockText.slice(0, firstNewline), body: blockText.slice(firstNewline + 1) };
}

function splitOversizedBlock(block, maxBodyChars) {
  const { tag, body } = splitTagLine(block.text);
  if (block.text.length <= maxBodyChars) return [block.text];
  const paragraphs = body.split(/\n\n+/);
  const chunks = [];
  let current = [];
  let currentLen = 0;
  const flush = () => {
    if (!current.length) return;
    chunks.push(current.join('\n\n'));
    current = [];
    currentLen = 0;
  };
  for (const paragraph of paragraphs) {
    const piece = paragraph.trim();
    if (!piece) continue;
    const addLen = piece.length + (current.length ? 2 : 0);
    if (currentLen + addLen > maxBodyChars && current.length) flush();
    if (piece.length > maxBodyChars) {
      flush();
      for (let offset = 0; offset < piece.length; offset += maxBodyChars) {
        chunks.push(piece.slice(offset, offset + maxBodyChars));
      }
      continue;
    }
    current.push(piece);
    currentLen += addLen;
  }
  flush();
  if (!chunks.length) return [block.text];
  return chunks.map((chunk, index) => {
    const continuation = index === 0 ? tag : `${tag} (continuação)`;
    const hasOcr = body.includes(OCR_MARK) && index === chunks.length - 1;
    const lines = [continuation, chunk];
    if (hasOcr) lines.push(OCR_MARK);
    return lines.join('\n');
  });
}

function renderIndex(caseResult, docPartMap, totalParts) {
  return renderPackIndex(caseResult, {
    partColForDoc: (docId) => {
      const list = docPartMap.get(String(docId));
      if (!list?.length) return '—';
      return list.map((n) => `${n}/${totalParts}`).join(', ');
    },
  });
}

function statsLine(caseResult) {
  const docs = caseResult?.documents?.length ?? 0;
  const pages = (caseResult?.pages ?? []).filter((page) => page.hasText).length;
  const gaps = (caseResult?.gaps ?? []).filter((gap) => TEXT_GAPS.has(gap.reason)).length;
  return `Peças: ${docs}. Páginas com texto: ${pages}. Lacunas: ${gaps}.`;
}

function passageSection(passages) {
  return `## Passagens\n\n${passages.join('\n\n')}`;
}

function footer(partIndex, totalParts) {
  return `FIM DA PARTE ${partIndex} DE ${totalParts}`;
}

function packUnitsIntoParts(units, maxChars, headerSizes) {
  const partBodies = [[]];
  const partLengths = [headerSizes[0] ?? 0];

  const startNewPart = () => {
    partBodies.push([]);
    const partIndex = partBodies.length;
    partLengths.push(headerSizes[partIndex - 1] ?? headerSizes.at(-1) ?? 0);
  };

  for (const unit of units) {
    const partIndex = partBodies.length - 1;
    const sep = partBodies[partIndex].length ? 2 : 0;
    const nextLen = partLengths[partIndex] + sep + unit.length;
    if (nextLen > maxChars && partBodies[partIndex].length > 0) {
      startNewPart();
    }
    const newPartIndex = partBodies.length - 1;
    const newSep = partBodies[newPartIndex].length ? 2 : 0;
    partBodies[newPartIndex].push(unit);
    partLengths[newPartIndex] += newSep + unit.length;
  }
  return partBodies;
}

function docIdFromPassageTag(passage) {
  const match = passage.match(/^\[ID\s+([^,\]]+)/i);
  return match?.[1] ?? '—';
}

function buildDocPartMap(partBodies) {
  const map = new Map();
  partBodies.forEach((body, partIndex) => {
    const partNumber = partIndex + 1;
    for (const passage of body) {
      const docId = docIdFromPassageTag(passage);
      if (!map.has(docId)) map.set(docId, []);
      const list = map.get(docId);
      if (!list.includes(partNumber)) list.push(partNumber);
    }
  });
  for (const list of map.values()) list.sort((a, b) => a - b);
  return map;
}

function idsInPart(passages) {
  const ids = new Set();
  for (const passage of passages) {
    ids.add(docIdFromPassageTag(passage));
  }
  return [...ids].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
}

function renderPartTexts(caseResult, partBodies, docPartMap, totalParts) {
  const gaps = renderPackGaps(caseResult);
  const index = renderIndex(caseResult, docPartMap, totalParts);
  const stats = statsLine(caseResult);
  const notice = packNoticeLines().join('\n');

  return partBodies.map((passages, partIndex) => {
    const partNumber = partIndex + 1;
    const passageBlock = passageSection(passages);
    let body;
    if (partNumber === 1) {
      body = [
        `# Pacote do caso — parte 1 de ${totalParts}`,
        '',
        notice,
        '',
        stats,
        '',
        '## Índice',
        '',
        index,
        '',
        '## Lacunas',
        '',
        gaps,
        '',
        passageBlock,
        '',
        footer(partNumber, totalParts),
      ].join('\n');
    } else {
      const idList = idsInPart(passages).join(', ') || '—';
      body = [
        `# parte ${partNumber} de ${totalParts}`,
        '',
        `IDs nesta parte: ${idList}.`,
        '',
        passageBlock,
        '',
        footer(partNumber, totalParts),
      ].join('\n');
    }
    return body;
  });
}

function estimateHeaders(caseResult, partCountGuess) {
  const gaps = renderPackGaps(caseResult);
  const stats = statsLine(caseResult);
  const notice = packNoticeLines().join('\n');
  const placeholderMap = new Map((caseResult?.documents ?? []).map((doc) => [String(doc.docId), [1]]));
  const index = renderIndex(caseResult, placeholderMap, Math.max(1, partCountGuess));
  const part1 = [
    `# Pacote do caso — parte 1 de ${partCountGuess}`,
    '',
    notice,
    '',
    stats,
    '',
    '## Índice',
    '',
    index,
    '',
    '## Lacunas',
    '',
    gaps,
    '',
    '## Passagens',
    '',
    footer(1, partCountGuess),
  ].join('\n');
  const partN = [
    `# parte 2 de ${partCountGuess}`,
    '',
    'IDs nesta parte: —.',
    '',
    '## Passagens',
    '',
    footer(2, partCountGuess),
  ].join('\n');
  return { part1: part1.length, other: partN.length };
}

export function buildCasePackParts(caseResult, { maxChars = DEFAULT_PACK_PART_MAX_CHARS } = {}) {
  const blocks = collectPassageBlocks(caseResult);
  const headersOne = estimateHeaders(caseResult, 1);
  const bodyBudgetOther = Math.max(1000, maxChars - estimateHeaders(caseResult, 2).other - 64);
  let units = blocks.map((block) => block.text);
  const singlePassageBudget = Math.max(1000, maxChars - headersOne.part1 - 64);
  units = blocks.flatMap((block) => {
    if (block.text.length <= singlePassageBudget) return [block.text];
    return splitOversizedBlock(block, bodyBudgetOther);
  });

  const singleMap = buildDocPartMap([units]);
  const singleTexts = renderPartTexts(caseResult, [units], singleMap, 1);
  if (singleTexts[0].length <= maxChars) {
    return [{ name: partFileName(1, 1), text: singleTexts[0] }];
  }

  const headers = headersOne;
  const bodyBudget = Math.max(1000, maxChars - headers.part1 - 64);
  units = blocks.flatMap((block) => splitOversizedBlock(block, bodyBudget));

  let partBodies = packUnitsIntoParts(units, maxChars, [headers.part1, headers.other]);
  let totalParts = partBodies.length;
  let docPartMap = buildDocPartMap(partBodies);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const sized = estimateHeaders(caseResult, totalParts);
    partBodies = packUnitsIntoParts(units, maxChars, [sized.part1, sized.other]);
    totalParts = partBodies.length;
    docPartMap = buildDocPartMap(partBodies);
    const texts = renderPartTexts(caseResult, partBodies, docPartMap, totalParts);
    if (texts.every((text) => text.length <= maxChars)) {
      return texts.map((text, index) => ({
        name: partFileName(index + 1, totalParts),
        text,
      }));
    }
    headers.part1 = sized.part1 + 500;
  }

  const texts = renderPartTexts(caseResult, partBodies, docPartMap, totalParts);
  return texts.map((text, index) => ({
    name: partFileName(index + 1, totalParts),
    text,
  }));
}

export function extractPassagesFromPack(pack) {
  const marker = '## Texto';
  const start = pack.indexOf(marker);
  if (start === -1) return '';
  return pack.slice(start + marker.length).replace(/^\s*\n/, '').trim();
}

/** Passage bodies only, in order (multi-part files). */
export function extractPassagesFromPartText(text) {
  const marker = '## Passagens';
  const start = text.indexOf(marker);
  if (start === -1) return '';
  let body = text.slice(start + marker.length).replace(/^\s*\n/, '');
  const footerMatch = body.match(/\nFIM DA PARTE \d+ DE \d+\s*$/);
  if (footerMatch) body = body.slice(0, footerMatch.index);
  return body.trim();
}

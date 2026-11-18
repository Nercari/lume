// One Markdown file to attach in ChatGPT. No case number in the file name.
import { OCR_MARK } from './ocr-text.js';
import { formatSpan, pagesByDoc, sheetNumber } from './sheets.js';

export const PACK_FILENAME = 'lume-pacote-do-caso.md';

const TEXT_GAPS = new Set(['unreadable_page', 'image_no_text', 'corrupt_file', 'empty_text']);

export function passageTag(docId, pageInDoc) {
  return `[ID ${docId}, pág. ${pageInDoc}]`;
}

export function packNoticeLines() {
  return [
    'Pacote do caso gerado no Lume (somente dados extraídos neste computador).',
    'Três localizadores distintos: **ID** (documento no PJe), **pág. do documento** (folha interna, rodapé ou “Página N de M”) e **pág. do PDF** (página do arquivo PDF mesclado, só quando a origem é PDF). Não misture nem estime.',
    `Marcação de passagem: ${passageTag('X', 'Y')} — ID e pág. do documento.`,
    'Lacunas (ilegível, imagem sem texto, binário) não têm texto recuperável; não invente.',
    'Trechos com OCR podem conter erros de leitura.',
    'Nada deste arquivo foi enviado a um servidor.',
  ];
}

export function gapSituationLabel(reason) {
  switch (reason) {
    case 'unreadable_page':
      return 'ilegível';
    case 'image_no_text':
      return 'imagem sem texto';
    case 'corrupt_file':
      return 'binário';
    case 'empty_text':
      return 'ilegível';
    default:
      return 'ilegível';
  }
}

function cell(value) {
  const text = String(value ?? '—').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  return text || '—';
}

function documentSituation(pages, docGaps) {
  if (docGaps.some((g) => g.reason === 'corrupt_file')) return 'binário';
  if (docGaps.some((g) => g.reason === 'image_no_text') && !pages.some((p) => p.hasText)) return 'imagem sem texto';
  if (docGaps.some((g) => g.reason === 'unreadable_page' || g.reason === 'empty_text') && !pages.some((p) => p.hasText)) {
    return 'ilegível';
  }
  const readable = pages.filter((p) => p.hasText);
  if (!readable.length) return 'imagem sem texto';
  if (readable.every((p) => p.method === 'ocr')) return 'OCR';
  if (readable.some((p) => p.method === 'ocr')) return 'OCR';
  return 'legível';
}

function joinedDateOf(doc) {
  return doc?.date ?? doc?.joinedAt ?? doc?.joinDate ?? null;
}

export function renderPackIndex(caseResult, { partColForDoc } = {}) {
  const isPdf = caseResult?.origin !== 'text';
  const head = isPdf
    ? '| ID | Tipo | Título | Data de juntada | Págs. do documento | Págs. do PDF | Partes | Situação |'
    : '| ID | Tipo | Título | Data de juntada | Págs. do documento | Partes | Situação |';
  const colCount = isPdf ? 8 : 7;
  const ruleLine = `| ${Array(colCount).fill('---').join(' | ')} |`;
  const groups = pagesByDoc(caseResult);
  const docs = caseResult?.documents ?? [];
  const gaps = caseResult?.gaps ?? [];
  if (!docs.length) {
    const empty = isPdf ? '| — | — | — | — | — | — | — | — |' : '| — | — | — | — | — | — | — |';
    return `${head}\n${ruleLine}\n${empty}`;
  }
  const rows = docs.map((doc) => {
    const pages = groups.get(String(doc.docId)) ?? [];
    const sheets = pages.map((page, index) => sheetNumber(page, index + 1));
    const docGaps = gaps.filter((g) => String(g.docId) === String(doc.docId));
    const situation = documentSituation(pages, docGaps);
    const partes = partColForDoc?.(doc.docId) ?? '1/1';
    const base = [
      cell(doc.docId),
      cell(doc.piece),
      cell(doc.title),
      cell(joinedDateOf(doc)),
      cell(formatSpan(sheets)),
    ];
    if (isPdf) {
      const pdfPages = formatSpan(doc.pages ?? pages.map((page) => page.n));
      base.push(cell(pdfPages), cell(partes), cell(situation));
    } else {
      base.push(cell(partes), cell(situation));
    }
    return `| ${base.join(' | ')} |`;
  });
  return [head, ruleLine, ...rows].join('\n');
}

export function renderPackGaps(caseResult) {
  const listed = (caseResult?.gaps ?? []).filter((gap) => TEXT_GAPS.has(gap.reason));
  if (!listed.length) return 'Nenhuma lacuna.';
  return listed.map((gap) => {
    const bits = [];
    if (gap.docId) bits.push(`ID ${gap.docId}`);
    if (gap.pageInDoc != null) bits.push(`pág. do documento ${gap.pageInDoc}`);
    if (gap.page != null && caseResult?.origin !== 'text') bits.push(`pág. do PDF ${gap.page}`);
    const label = gapSituationLabel(gap.reason);
    return `- ${bits.join(', ') || 'arquivo'} (${label}): ${gap.detail || gap.reason}`;
  }).join('\n');
}

function renderBody(caseResult) {
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
      const lines = [passageTag(page.docId, sheet), text];
      if (page.method === 'ocr') lines.push(OCR_MARK);
      blocks.push(lines.join('\n'));
    });
  }
  return blocks.length ? blocks.join('\n\n') : 'Nenhum trecho com texto.';
}

export function buildCasePack(caseResult) {
  return [
    packNoticeLines().join('\n'),
    `## Índice\n\n${renderPackIndex(caseResult)}`,
    `## Lacunas\n\n${renderPackGaps(caseResult)}`,
    `## Texto\n\n${renderBody(caseResult)}`,
    '',
  ].join('\n\n');
}

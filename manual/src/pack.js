// One Markdown file to attach in ChatGPT. No case number in the file name.
import { OCR_MARK } from './ocr-text.js';
import { formatSpan, pagesByDoc, sheetNumber } from './sheets.js';

export const PACK_FILENAME = 'lume-pacote-do-caso.md';

const HEADER = [
  'Pacote do caso para anexar no ChatGPT. O texto foi extraído neste computador.',
  'Cite no formato [Id X, fl. Y], em que Y é a folha dentro do documento.',
  'Não invente conteúdo de páginas listadas como lacuna.',
  'Onde houver a marca de OCR, o texto pode conter erros de leitura.',
  'Nada deste arquivo foi enviado a um servidor.',
];

const TEXT_GAPS = new Set(['unreadable_page', 'image_no_text', 'corrupt_file', 'empty_text']);

function cell(value) {
  const text = String(value ?? '—').replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
  return text || '—';
}

function renderIndex(caseResult) {
  const head = '| Id | tipo | título | fls. | páginas do PDF | OCR? |';
  const rule = '| --- | --- | --- | --- | --- | --- |';
  const groups = pagesByDoc(caseResult);
  const docs = caseResult?.documents ?? [];
  if (!docs.length) return `${head}\n${rule}\n| — | — | — | — | — | — |`;
  const rows = docs.map((doc) => {
    const pages = groups.get(String(doc.docId)) ?? [];
    const sheets = pages.map((page, index) => sheetNumber(page, index + 1));
    const pdfPages = caseResult?.origin === 'text'
      ? '—'
      : formatSpan(doc.pages ?? pages.map((page) => page.n));
    const ocr = pages.some((page) => page.method === 'ocr') ? 'sim' : 'não';
    return `| ${cell(doc.docId)} | ${cell(doc.piece)} | ${cell(doc.title)} | ${cell(formatSpan(sheets))} | ${cell(pdfPages)} | ${ocr} |`;
  });
  return [head, rule, ...rows].join('\n');
}

function renderGaps(caseResult) {
  const listed = (caseResult?.gaps ?? []).filter((gap) => TEXT_GAPS.has(gap.reason));
  if (!listed.length) return 'Nenhuma lacuna.';
  return listed.map((gap) => {
    const bits = [];
    if (gap.docId) bits.push(`Id ${gap.docId}`);
    if (gap.pageInDoc != null) bits.push(`fl. ${gap.pageInDoc}`);
    if (gap.page != null) {
      bits.push(caseResult?.origin === 'text' ? `trecho ${gap.page}` : `página ${gap.page} do PDF`);
    }
    return `- ${bits.join(', ') || 'arquivo'}: ${gap.detail || gap.reason}`;
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
      const lines = [`[Id ${page.docId}, fl. ${sheet}]`, text];
      if (page.method === 'ocr') lines.push(OCR_MARK);
      blocks.push(lines.join('\n'));
    });
  }
  return blocks.length ? blocks.join('\n\n') : 'Nenhum trecho com texto.';
}

export function buildCasePack(caseResult) {
  return [
    HEADER.join('\n'),
    `## Índice das peças\n\n${renderIndex(caseResult)}`,
    `## Lacunas\n\n${renderGaps(caseResult)}`,
    `## Texto\n\n${renderBody(caseResult)}`,
    '',
  ].join('\n\n');
}
